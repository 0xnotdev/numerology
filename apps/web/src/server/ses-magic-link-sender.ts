import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { MagicLinkSender } from "@numerology/application";

interface MailTransport {
  send(command: SendEmailCommand, options: { abortSignal: AbortSignal }): Promise<unknown>;
}

/** Production transport: credentials come from the AWS SDK provider chain, never client input. */
export function createSesMagicLinkSender(
  fromEmail: string,
  transport?: MailTransport,
): MagicLinkSender {
  if (
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/u.test(fromEmail) ||
    fromEmail.length > 254
  )
    throw new RangeError("AUTH_SENDER_INVALID");
  const client = transport ?? new SESv2Client({ region: "ap-south-1", maxAttempts: 1 });
  return {
    async send(message, signal) {
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: fromEmail,
          Destination: { ToAddresses: [message.email] },
          Content: {
            Simple: {
              Subject: { Data: "Your sign-in link for The Numbered Life", Charset: "UTF-8" },
              Body: {
                Text: {
                  Charset: "UTF-8",
                  Data: `Use this link to sign in:\n\n${message.url}\n\nOpen it in the same browser where you requested it, then confirm sign-in. The link expires in 10 minutes and can be used once. If you did not request it, you can ignore this email.`,
                },
              },
            },
          },
        }),
        { abortSignal: signal },
      );
    },
  };
}
