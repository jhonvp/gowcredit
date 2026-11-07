import { createTransport, type Transporter } from 'nodemailer';
import type { MailerPort, MailMessage } from '../../application/ports/clarification.ports';

/** SMTP via Nodemailer: Mailpit locally (http://localhost:8025), SES SMTP in AWS. */
export class NodemailerAdapter implements MailerPort {
  private readonly transport: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = createTransport(smtpUrl);
  }

  async send(m: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html,
    });
  }
}
