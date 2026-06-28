import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  readonly uploadsDir: string;

  constructor() {
    this.uploadsDir = path.resolve(process.cwd(), 'uploads');
    fs.mkdirSync(this.uploadsDir, { recursive: true });
  }

  saveFile(invoiceId: string, buffer: Buffer): void {
    const filePath = path.join(this.uploadsDir, invoiceId);
    fs.writeFileSync(filePath, buffer);
    this.logger.log(`Saved file ${invoiceId} (${buffer.length} bytes)`);
  }

  deleteFile(invoiceId: string): void {
    try {
      const filePath = path.join(this.uploadsDir, invoiceId);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      this.logger.error(`Failed to delete file ${invoiceId}`, err);
    }
  }

  getFilePath(invoiceId: string): string {
    return path.join(this.uploadsDir, invoiceId);
  }

  fileExists(invoiceId: string): boolean {
    return fs.existsSync(path.join(this.uploadsDir, invoiceId));
  }
}
