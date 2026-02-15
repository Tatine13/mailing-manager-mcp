import nodemailer, { Transporter } from 'nodemailer';
import { Account, SendEmailParams } from '../core/types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export class SmtpClient {
  private transporter: Transporter | null = null;

  constructor(
    private account: Account,
    private password: string
  ) {}

  async connect(): Promise<void> {
    this.transporter = nodemailer.createTransport({
      host: this.account.smtp.host,
      port: this.account.smtp.port,
      secure: this.account.smtp.port === 465,
      auth: {
        user: this.account.email,
        pass: this.password
      },
      tls: {
        rejectUnauthorized: true
      }
    });

    // Verify connection
    await this.transporter.verify();
    logger.info({ email: this.account.email }, 'SMTP connected');
  }

  async disconnect(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }

  async sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
    if (!this.transporter) {
      throw new Error('SMTP not connected. Call connect() first.');
    }

    const mailOptions: any = {
      from: this.account.email,
      to: params.to.join(', '),
      subject: params.subject,
      text: params.body,
    };

    if (params.cc?.length) mailOptions.cc = params.cc.join(', ');
    if (params.bcc?.length) mailOptions.bcc = params.bcc.join(', ');
    if (params.html) mailOptions.html = params.html;
    if (params.replyTo) mailOptions.replyTo = params.replyTo;
    if (params.inReplyTo) {
      mailOptions.inReplyTo = params.inReplyTo;
      mailOptions.references = params.inReplyTo;
    }

    if (params.attachments?.length) {
      mailOptions.attachments = params.attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType
      }));
    }

    const result = await this.transporter.sendMail(mailOptions);

    logger.info({
      to: params.to,
      subject: params.subject,
      messageId: result.messageId
    }, 'Email sent');

    return { messageId: result.messageId };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      await this.disconnect();
      return true;
    } catch (error) {
      logger.error({ error, email: this.account.email }, 'SMTP connection test failed');
      try { await this.disconnect(); } catch {}
      return false;
    }
  }
}
