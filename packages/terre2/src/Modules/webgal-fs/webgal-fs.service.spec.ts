import { Test, TestingModule } from '@nestjs/testing';
import { ConsoleLogger } from '@nestjs/common';
import { WebgalFsService } from './webgal-fs.service';

describe('WebgalFsService', () => {
  let service: WebgalFsService;

  beforeEach(async () => {
    const mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebgalFsService,
        {
          provide: ConsoleLogger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<WebgalFsService>(WebgalFsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Path Traversal Prevention', () => {
    it('should reject absolute paths outside allowed base', async () => {
      await expect(service.getDirInfo('/etc/passwd')).rejects.toThrow(
        'Access denied: path outside allowed directory',
      );
    });

    it('should reject relative paths escaping the base directory', async () => {
      await expect(service.getDirInfo('../../../etc/passwd')).rejects.toThrow(
        'Access denied: path outside allowed directory',
      );
    });

    it('should reject encoded path traversal attempts', async () => {
      await expect(service.getDirInfo('%2e%2e%2f%2e%2e%2fetc')).rejects.toThrow(
        'Access denied: path outside allowed directory',
      );
    });

    it('should allow paths within the allowed base directory', async () => {
      // This test assumes a valid subdirectory exists in process.cwd()
      // It will fail gracefully if the directory doesn't exist, which is expected
      await expect(service.exists('./valid/path')).resolves.toBeDefined();
    });

    it('should validate paths in readTextFile', async () => {
      await expect(service.readTextFile('/etc/passwd')).rejects.toThrow(
        'Access denied',
      );
    });

    it('should validate paths in updateTextFile', async () => {
      await expect(
        service.updateTextFile('/etc/passwd', 'malicious'),
      ).rejects.toThrow('Access denied');
    });

    it('should validate paths in deleteFile', async () => {
      await expect(service.deleteFile('/etc/passwd')).rejects.toThrow(
        'Access denied',
      );
    });

    it('should validate source and destination in copy', async () => {
      await expect(service.copy('/etc/passwd', './local')).rejects.toThrow(
        'Access denied',
      );

      await expect(service.copy('./local', '/etc/passwd')).rejects.toThrow(
        'Access denied',
      );
    });
  });
});
