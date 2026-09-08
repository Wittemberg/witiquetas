#!/usr/bin/env node
/**
 * ============================================================================
 * PROVISIONAMENTO SEGURO DE TOTP — WITIQUETAS DCC (DEVELOPER CONTROL CENTER)
 * ============================================================================
 *
 * USO EXCLUSIVO LOCAL / CLI:
 * Gera segredo criptograficamente forte RFC 6238, URI otpauth e QR Code para
 * escaneamento no Google Authenticator / Authy / 1Password.
 *
 * REGRAS DE SEGURANÇA:
 * - NUNCA comitar ou salvar a chave gerada em arquivos versionados.
 * - NUNCA exibir este QR Code em endpoints HTTP públicos.
 * - A chave deve ser configurada manualmente nas variáveis de ambiente da stack
 *   (DCC_TOTP_SECRET) no Portainer / Docker.
 */

import crypto from 'node:crypto';
import QRCode from 'qrcode';

// Tabela de caracteres Base32 RFC 4648
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateBase32Secret(byteLength = 20) {
  const randomBytes = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < randomBytes.length; i++) {
    value = (value << 8) | randomBytes[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

async function main() {
  const username = process.argv[2] || 'Marcel';
  const issuer = 'Witiquetas DCC';
  const secret = generateBase32Secret(20); // 160-bit crypto secret

  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(`${issuer}:${username}`);
  const otpauthUri = `otpauth://totp/${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

  console.log('\n================================================================');
  console.log('  WITIQUETAS — PROVISIONAMENTO SEGURO DE CREDENCIAL TOTP (DCC) ');
  console.log('================================================================\n');
  console.log(`Conta:   ${username}`);
  console.log(`Emissor: ${issuer}`);
  console.log(`Segredo: ${secret}`);
  console.log(`URI:     ${otpauthUri}\n`);

  console.log('Escaneie o QR Code abaixo com o Google Authenticator ou similar:\n');

  try {
    const terminalQr = await QRCode.toString(otpauthUri, {
      type: 'terminal',
      small: true,
    });
    console.log(terminalQr);
  } catch (err) {
    console.error('Falha ao renderizar QR Code no terminal:', err);
  }

  console.log('----------------------------------------------------------------');
  console.log('INSTRUÇÕES DE INSTALAÇÃO EM PRODUÇÃO:');
  console.log('1. Cadastre a conta no Google Authenticator escaneando o QR Code.');
  console.log('2. No Portainer (Stack witiquetas -> Environment variables), adicione:');
  console.log(`   DCC_TOTP_SECRET=${secret}`);
  console.log('3. Atualize a Stack (Update the stack).');
  console.log('4. Acesse https://witiquetas.wrtec.com.br/#developer para testar o login.');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('[ERRO] Falha no provisionamento TOTP:', err);
  process.exit(1);
});
