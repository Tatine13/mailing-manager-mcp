/**
 * Utility to decode email body encodings (Quoted-Printable and Base64)
 */
export class EmailDecoder {
  static decode(text: string, encoding?: string): string {
    if (!text) return '';
    const enc = encoding?.toLowerCase();
    if (enc === 'quoted-printable') return this.decodeQuotedPrintable(text);
    if (enc === 'base64') return this.decodeBase64(text);

    // Auto-detection logic (conservative)
    if (text.includes('=C3') || text.includes('=\n') || text.includes('=\r\n')) {
      return this.decodeQuotedPrintable(text);
    }
    return text;
  }

  static decodeQuotedPrintable(text: string): string {
    // 1. Remove soft line breaks
    let workingText = text.replace(/=\r?\n/g, '');

    // 2. Decode hex sequences using a byte array to handle UTF-8 correctly
    const bytes: number[] = [];
    for (let i = 0; i < workingText.length; i++) {
      const char = workingText[i];
      if (char === '=' && i + 2 < workingText.length) {
        const hex = workingText.substring(i + 1, i + 3);
        if (/^[0-9A-F]{2}$/i.test(hex)) {
          bytes.push(parseInt(hex, 16));
          i += 2;
          continue;
        }
      }
      // If not a hex sequence, encode the character as bytes (UTF-8)
      const charCode = workingText.charCodeAt(i);
      if (charCode < 128) {
        bytes.push(charCode);
      } else {
        // Handle multi-byte characters already present in the string
        const encoded = Buffer.from(char, 'utf-8');
        for (const byte of encoded) {
          bytes.push(byte);
        }
      }
    }

    return Buffer.from(bytes).toString('utf-8');
  }

  static decodeBase64(text: string): string {
    try {
      const clean = text.replace(/\s/g, '');
      return Buffer.from(clean, 'base64').toString('utf-8');
    } catch {
      return text;
    }
  }

  /**
   * Simple HTML to Text converter
   */
  static stripHtml(html: string): string {
    if (!html) return '';
    
    return html
      .replace(/<style([\s\S]*?)<\/style>/gi, '') // Remove CSS
      .replace(/<script([\s\S]*?)<\/script>/gi, '') // Remove JS
      .replace(/<br\s*\/?>/gi, '\n') // Convert BR to newline
      .replace(/<\/p>/gi, '\n\n') // Convert P end to double newline
      .replace(/<[^>]+>/g, '') // Remove all other tags
      .replace(/&nbsp;/g, ' ') // Decode common entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n\s*\n/g, '\n\n') // Collapse multiple newlines
      .trim();
  }
}
