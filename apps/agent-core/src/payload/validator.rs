use base64::prelude::*;
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Error, Debug, PartialEq, Eq)]
pub enum PayloadValidationError {
    #[error("Falha ao decodificar Base64 do payload: {0}")]
    Base64DecodeError(String),
    #[error("Tamanho do payload inválido: esperado {expected} bytes, decodificado {actual} bytes")]
    LengthMismatch { expected: usize, actual: usize },
    #[error("Checksum SHA-256 inválido: esperado '{expected}', calculado '{actual}'")]
    ChecksumMismatch { expected: String, actual: String },
}

pub struct PayloadValidator;

impl PayloadValidator {
    /// Valida e decodifica o payload binário seguindo a ordem estrita:
    /// Base64 válido -> Validação de Tamanho exato -> Validação de Checksum SHA-256
    pub fn validate_and_decode(
        payload_base64: &str,
        expected_length: usize,
        expected_checksum_sha256: &str,
    ) -> Result<Vec<u8>, PayloadValidationError> {
        // 1. Decodificar Base64
        let bytes = BASE64_STANDARD
            .decode(payload_base64.trim())
            .map_err(|e| PayloadValidationError::Base64DecodeError(e.to_string()))?;

        // 2. Validar tamanho em bytes
        if bytes.len() != expected_length {
            return Err(PayloadValidationError::LengthMismatch {
                expected: expected_length,
                actual: bytes.len(),
            });
        }

        // 3. Validar Checksum SHA-256
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let actual_hash = hex::encode(hasher.finalize());

        let expected_hash_lower = expected_checksum_sha256.trim().to_lowercase();
        if actual_hash != expected_hash_lower {
            return Err(PayloadValidationError::ChecksumMismatch {
                expected: expected_hash_lower,
                actual: actual_hash,
            });
        }

        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_payload_validation() {
        let sample = b"I8,A,001\nQ240,024\nq831\nP1\n";
        let base64_str = BASE64_STANDARD.encode(sample);
        let mut hasher = Sha256::new();
        hasher.update(sample);
        let sha256_str = hex::encode(hasher.finalize());

        let result = PayloadValidator::validate_and_decode(&base64_str, sample.len(), &sha256_str);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), sample);
    }

    #[test]
    fn test_invalid_base64() {
        let result = PayloadValidator::validate_and_decode("invalid_base64!!", 10, "abc");
        assert!(matches!(result, Err(PayloadValidationError::Base64DecodeError(_))));
    }

    #[test]
    fn test_length_mismatch() {
        let sample = b"TESTE";
        let base64_str = BASE64_STANDARD.encode(sample);
        let mut hasher = Sha256::new();
        hasher.update(sample);
        let sha256_str = hex::encode(hasher.finalize());

        let result = PayloadValidator::validate_and_decode(&base64_str, 999, &sha256_str);
        assert!(matches!(result, Err(PayloadValidationError::LengthMismatch { .. })));
    }

    #[test]
    fn test_checksum_mismatch() {
        let sample = b"TESTE";
        let base64_str = BASE64_STANDARD.encode(sample);

        let result = PayloadValidator::validate_and_decode(&base64_str, sample.len(), "sha256_falso_incorreto");
        assert!(matches!(result, Err(PayloadValidationError::ChecksumMismatch { .. })));
    }
}
