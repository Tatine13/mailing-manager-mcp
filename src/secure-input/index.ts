import { EphemeralSecureServer } from './ephemeral-server.js';
import { AccountCredentials, SecureInputField } from '../core/types.js';
import { getLogger } from '../utils/logger.js';

export class SecureInput {
  private server: EphemeralSecureServer;

  constructor(mode: 'local' | 'remote' = 'local', timeoutMs: number = 300_000) {
    const isRemote = mode === 'remote' || !process.stdout.isTTY || !!process.env.REMOTE_MODE;
    this.server = new EphemeralSecureServer({
      mode: isRemote ? 'remote' : 'local',
      timeoutMs
    });
  }

  async password(message: string, title?: string): Promise<string> {
    const result = await this.server.requestInput<{ password: string }>({
      type: 'password',
      title: title || '🔐 Password Required',
      message
    });
    return result.password;
  }

  async masterKeySetup(): Promise<string> {
    const result = await this.server.requestInput<{
      password: string;
      confirm: string;
    }>({
      type: 'multi-field',
      title: '🔑 Master Key Setup',
      message: 'Create a master password to encrypt all your data',
      fields: [
        {
          name: 'password',
          label: 'Master Password',
          type: 'password',
          required: true,
          placeholder: '',
          validation: { minLength: 12, message: 'Minimum 12 characters' }
        },
        {
          name: 'confirm',
          label: 'Confirm Master Password',
          type: 'password',
          required: true,
          placeholder: ''
        }
      ]
    });

    if (result.password !== result.confirm) {
      throw new Error('Passwords do not match');
    }

    return result.password;
  }

  async masterKeyUnlock(): Promise<string> {
    return this.password('Enter your master password to unlock', '🔓 Unlock Vault');
  }

  async accountSetup(initialData?: Partial<AccountCredentials>, onUrl?: (publicUrl: string, localUrl: string) => void): Promise<AccountCredentials> {
    const promise = this.server.requestInput<Record<string, string>>({
      type: 'multi-field',
      title: '📧 Email Account Setup',
      message: 'Configure your email account securely',
      fields: [
        {
          name: 'email',
          label: 'Email Address',
          type: 'email',
          required: true,
          placeholder: 'you@example.com',
          value: initialData?.email,
          readOnly: !!initialData?.email
        },
        {
          name: 'password',
          label: 'Password or App Password',
          type: 'password',
          required: true,
          placeholder: ''
        },
        {
          name: 'provider',
          label: 'Email Provider',
          type: 'select',
          required: true,
          value: initialData?.provider,
          readOnly: !!initialData?.provider,
          options: [
            { value: 'gmail', label: 'Gmail' },
            { value: 'outlook', label: 'Outlook / Microsoft 365' },
            { value: 'yahoo', label: 'Yahoo Mail' },
            { value: 'icloud', label: 'iCloud Mail' },
            { value: 'fastmail', label: 'Fastmail' },
            { value: 'custom', label: 'Custom IMAP/SMTP' }
          ]
        },
        {
          name: 'imapHost',
          label: 'IMAP Server (custom only)',
          type: 'text',
          required: false,
          placeholder: 'imap.example.com',
          value: initialData?.imapHost,
          readOnly: !!initialData?.imapHost
        },
        {
          name: 'imapPort',
          label: 'IMAP Port (custom only)',
          type: 'number',
          required: false,
          placeholder: '993',
          value: initialData?.imapPort?.toString(),
          readOnly: !!initialData?.imapPort
        },
        {
          name: 'smtpHost',
          label: 'SMTP Server (custom only)',
          type: 'text',
          required: false,
          placeholder: 'smtp.example.com',
          value: initialData?.smtpHost,
          readOnly: !!initialData?.smtpHost
        },
        {
          name: 'smtpPort',
          label: 'SMTP Port (custom only)',
          type: 'number',
          required: false,
          placeholder: '587',
          value: initialData?.smtpPort?.toString(),
          readOnly: !!initialData?.smtpPort
        }
      ]
    }, onUrl);

    // If onUrl is provided, we return a "pending" promise that resolves when the user submits
    // but the caller might have already returned the URL to the client.
    const raw = await promise;
    if (!raw) throw new Error('Secure input was cancelled or failed');

    getLogger().info({ fields: Object.keys(raw) }, 'Secure input resolved');

    return {
      email: raw.email || '',
      password: raw.password,
      provider: raw.provider as any,
      imapHost: raw.imapHost,
      imapPort: raw.imapPort ? parseInt(raw.imapPort, 10) : undefined,
      smtpHost: raw.smtpHost,
      smtpPort: raw.smtpPort ? parseInt(raw.smtpPort, 10) : undefined
    };
  }

  async multiField(
    title: string,
    message: string,
    fields: SecureInputField[]
  ): Promise<Record<string, string>> {
    return this.server.requestInput({
      type: 'multi-field',
      title,
      message,
      fields
    });
  }
}

export { EphemeralSecureServer } from './ephemeral-server.js';
