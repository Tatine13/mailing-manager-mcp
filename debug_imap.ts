import { ImapFlow } from 'imapflow';

async function main() {
  const client = new ImapFlow({
    host: 'imap.mail.com',
    port: 993,
    secure: true,
    auth: {
      user: 'geminiEA@mail.com',
      pass: 'ZTSIIA5QZCXW4UEOJK2L'
    },
    logger: false
  });

  try {
    console.log('Connecting to imap.mail.com...');
    await client.connect();
    console.log('✅ Connected');
    await client.logout();
  } catch (err) {
    console.error('❌ IMAP ERROR:', err.response || err.message);
    if (err.responseText) console.error('REASON:', err.responseText);
  }
}

main();
