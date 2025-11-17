import { validateProfileId, validatePath } from '../../src/utils/InputValidator';
import { ValidationError } from '../../src/errors/ValidationError';

describe('InputValidator - Profile ID', () => {
  describe('valid profile IDs', () => {
    it('should accept alphanumeric IDs', () => {
      expect(() => validateProfileId('work')).not.toThrow();
      expect(() => validateProfileId('personal')).not.toThrow();
      expect(() => validateProfileId('profile123')).not.toThrow();
    });

    it('should accept hyphens and underscores', () => {
      expect(() => validateProfileId('my-work')).not.toThrow();
      expect(() => validateProfileId('my_personal')).not.toThrow();
      expect(() => validateProfileId('work-profile-1')).not.toThrow();
    });

    it('should accept IDs up to 64 characters', () => {
      const longId = 'a'.repeat(64);
      expect(() => validateProfileId(longId)).not.toThrow();
    });
  });

  describe('invalid profile IDs', () => {
    it('should reject empty string', () => {
      expect(() => validateProfileId('')).toThrow(ValidationError);
      expect(() => validateProfileId('')).toThrow('Profile ID cannot be empty');
    });

    it('should reject path traversal attempts', () => {
      expect(() => validateProfileId('../etc/passwd')).toThrow(ValidationError);
      expect(() => validateProfileId('../../.ssh/authorized_keys')).toThrow();
      expect(() => validateProfileId('..')).toThrow();
      expect(() => validateProfileId('.')).toThrow();
    });

    it('should reject absolute paths', () => {
      expect(() => validateProfileId('/etc/passwd')).toThrow(ValidationError);
      expect(() => validateProfileId('/root/.ssh/id_rsa')).toThrow();
    });

    it('should reject Windows paths', () => {
      expect(() => validateProfileId('C:\\Windows\\System32')).toThrow(ValidationError);
      expect(() => validateProfileId('\\\\network\\share')).toThrow();
    });

    it('should reject Windows reserved names', () => {
      expect(() => validateProfileId('CON')).toThrow(ValidationError);
      expect(() => validateProfileId('PRN')).toThrow();
      expect(() => validateProfileId('AUX')).toThrow();
      expect(() => validateProfileId('NUL')).toThrow();
      expect(() => validateProfileId('COM1')).toThrow();
      expect(() => validateProfileId('LPT1')).toThrow();
    });

    it('should reject IDs with special characters', () => {
      expect(() => validateProfileId('profile@email')).toThrow(ValidationError);
      expect(() => validateProfileId('profile#123')).toThrow();
      expect(() => validateProfileId('profile$')).toThrow();
      expect(() => validateProfileId('profile%')).toThrow();
    });

    it('should reject IDs longer than 64 characters', () => {
      const tooLong = 'a'.repeat(65);
      expect(() => validateProfileId(tooLong)).toThrow(ValidationError);
      expect(() => validateProfileId(tooLong)).toThrow('cannot exceed 64 characters');
    });

    it('should reject IDs with whitespace', () => {
      expect(() => validateProfileId('my work')).toThrow(ValidationError);
      expect(() => validateProfileId('work\n')).toThrow();
      expect(() => validateProfileId('\twork')).toThrow();
    });
  });
});

describe('InputValidator - Paths', () => {
  describe('valid paths', () => {
    it('should accept absolute paths', () => {
      expect(() => validatePath('/home/user/.claude/tokens')).not.toThrow();
      expect(() => validatePath('/var/lib/app/data')).not.toThrow();
    });

    it('should accept Windows absolute paths', () => {
      expect(() => validatePath('C:\\Users\\Name\\AppData\\tokens')).not.toThrow();
      expect(() => validatePath('D:\\Data\\tokens')).not.toThrow();
    });
  });

  describe('invalid paths', () => {
    it('should reject relative paths', () => {
      expect(() => validatePath('./tokens')).toThrow(ValidationError);
      expect(() => validatePath('../tokens')).toThrow();
      expect(() => validatePath('tokens')).toThrow();
    });

    it('should reject path traversal', () => {
      expect(() => validatePath('/home/../../etc/passwd')).toThrow(ValidationError);
    });

    it('should reject dangerous system paths', () => {
      expect(() => validatePath('/etc/shadow')).toThrow(ValidationError);
      expect(() => validatePath('/etc/passwd')).toThrow();
      expect(() => validatePath('/dev/null')).toThrow();
      expect(() => validatePath('C:\\Windows\\System32')).toThrow();
    });

    it('should reject UNC paths', () => {
      expect(() => validatePath('\\\\network\\share')).toThrow(ValidationError);
    });

    it('should reject empty paths', () => {
      expect(() => validatePath('')).toThrow(ValidationError);
    });
  });
});
