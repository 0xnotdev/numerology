import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const excluded = new Set(["node_modules", "coverage", "reports", "qa", "research", "deliverables"]);
const printer = ts.createPrinter({ removeComments: true });

function sourceFiles(directory) {
  if (!existsSync(directory) || lstatSync(directory).isSymbolicLink()) return [];
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .flatMap((entry) => {
      if (entry.isSymbolicLink() || entry.name.startsWith(".") || excluded.has(entry.name))
        return [];
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(entry.name) &&
        !/\.(test|spec|expected|d)\.(ts|tsx)$/.test(entry.name)
        ? [path]
        : [];
    });
}

function importsOf(source) {
  const imports = new Map();
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const importedFrom = node.moduleSpecifier.text;
    const clause = node.importClause;
    if (clause?.name) imports.set(clause.name.text, { importedFrom, importedName: "default" });
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const item of bindings.elements) {
        imports.set(item.name.text, {
          importedFrom,
          importedName: (item.propertyName ?? item.name).text,
        });
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      imports.set(bindings.name.text, { importedFrom, importedName: "*" });
    }
  }
  return imports;
}

function expressionName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    const parent = expressionName(node.expression);
    return parent ? `${parent}.${node.name.text}` : node.name.text;
  }
  if (ts.isCallExpression(node)) return expressionName(node.expression);
  return undefined;
}

function referencesOf(node, imports) {
  const names = new Set();
  function visit(child) {
    if (ts.isTypeReferenceNode(child)) names.add(child.typeName.getText());
    if (ts.isExpressionWithTypeArguments(child)) names.add(child.expression.getText());
    if (ts.isCallExpression(child)) {
      const name = expressionName(child.expression);
      if (name) names.add(name);
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  return [...names].sort().map((name) => ({ name, ...imports.get(name) }));
}

function signatureOf(node, source) {
  if (ts.isFunctionDeclaration(node)) {
    const declaration = ts.factory.updateFunctionDeclaration(
      node,
      node.modifiers,
      node.asteriskToken,
      node.name,
      node.typeParameters,
      node.parameters,
      node.type,
      undefined,
    );
    return printer.printNode(ts.EmitHint.Unspecified, declaration, source);
  }
  if (ts.isVariableDeclaration(node)) {
    const type = node.type
      ? printer.printNode(ts.EmitHint.Unspecified, node.type, source)
      : "(inferred)";
    return `const ${node.name.getText(source)}: ${type};`;
  }
  if (ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) {
    return `${ts.isClassDeclaration(node) ? "class" : "enum"} ${node.name?.text ?? "default"};`;
  }
  return printer.printNode(ts.EmitHint.Unspecified, node, source);
}

/** A syntactic declaration/reference index, not a runtime call graph or a semantic type checker. */
export function buildIndex(root) {
  const files = ["apps", "packages"]
    .flatMap((group) => {
      const directory = join(root, group);
      if (!existsSync(directory)) return [];
      return readdirSync(directory, { withFileTypes: true })
        .filter(
          (entry) => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith("."),
        )
        .flatMap((entry) => sourceFiles(join(directory, entry.name, "src")));
    })
    .sort();
  const symbols = [];
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const imports = importsOf(source);
    for (const statement of source.statements) {
      const nodes = ts.isVariableStatement(statement)
        ? statement.declarationList.declarations
        : [statement];
      for (const node of nodes) {
        if (
          !(
            ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isFunctionDeclaration(node) ||
            ts.isClassDeclaration(node) ||
            ts.isEnumDeclaration(node) ||
            ts.isVariableDeclaration(node)
          )
        )
          continue;
        if (!node.name || !ts.isIdentifier(node.name)) continue;
        const signature = signatureOf(node, source);
        symbols.push({
          name: node.name.text,
          kind: ts.SyntaxKind[node.kind],
          file: relative(root, file).replaceAll("\\", "/"),
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          exported: Boolean(
            statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
          ),
          signature: signature.slice(0, 4000),
          truncated: signature.length > 4000,
          references: referencesOf(node, imports),
        });
      }
    }
  }
  return { version: 1, fileCount: files.length, symbols };
}

export function queryIndex(index, name) {
  const matches = index.symbols.filter((symbol) => symbol.name === name);
  return { total: matches.length, matches: matches.slice(0, 10) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  if (args.length > 0 && !(args.length === 2 && args[0] === "--symbol" && args[1])) {
    process.stderr.write("Usage: pnpm code:index | pnpm code:query ExactSymbolName\n");
    process.exitCode = 1;
  } else {
    const index = buildIndex(root);
    if (args[0] === "--symbol") {
      // Rebuild from current source so queries never rely on a stale cache.
      process.stdout.write(`${JSON.stringify(queryIndex(index, args[1]), null, 2)}\n`);
    } else {
      mkdirSync(join(root, ".cache"), { recursive: true });
      writeFileSync(join(root, ".cache/code-symbols.json"), `${JSON.stringify(index)}\n`);
      process.stdout.write(
        `Indexed ${index.symbols.length} declarations in ${index.fileCount} source files. Saved .cache/code-symbols.json.\n`,
      );
    }
  }
}
