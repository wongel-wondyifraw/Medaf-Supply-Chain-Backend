import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadRootDir = path.join(process.cwd(), 'uploads');

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    if (!fsSync.existsSync(this.uploadRootDir)) {
      await fs.mkdir(this.uploadRootDir, { recursive: true });
      this.logger.log(`Created uploads root directory at ${this.uploadRootDir}`);
    }
  }

  /**
   * Save an order item image under uploads/orders/<orderIdentifier>/<unique-filename>
   */
  async saveOrderImage(
    orderIdentifier: string,
    file: Express.Multer.File,
  ): Promise<{ url: string; relativePath: string }> {
    // Sanitize order identifier to avoid directory traversal
    const safeOrderFolder = orderIdentifier.replace(/[^a-zA-Z0-9_-]/g, '_');
    const orderDir = path.join(this.uploadRootDir, 'orders', safeOrderFolder);

    if (!fsSync.existsSync(orderDir)) {
      await fs.mkdir(orderDir, { recursive: true });
    }

    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const filename = `${uniqueSuffix}${ext}`;
    const filePath = path.join(orderDir, filename);

    await fs.writeFile(filePath, file.buffer);

    const relativePath = `/uploads/orders/${safeOrderFolder}/${filename}`;
    const backendUrl =
      this.configService.get<string>('BACKEND_URL') ||
      `http://localhost:${this.configService.get<number>('PORT', 3001)}`;
    const url = `${backendUrl.replace(/\/$/, '')}${relativePath}`;

    this.logger.log(`Saved order item image to ${filePath} (${url})`);
    return { url, relativePath };
  }

  /**
   * Delete an image file if it exists in the uploads directory
   */
  async deleteFile(fileUrlOrPath: string): Promise<void> {
    if (!fileUrlOrPath) return;

    try {
      // Extract the relative path starting from /uploads/
      const match = fileUrlOrPath.match(/\/uploads\/(.+)$/);
      if (!match) return; // Might be an external/Cloudinary URL

      const relativeFile = match[1];
      const absolutePath = path.join(this.uploadRootDir, relativeFile);

      // Security check: ensure path stays within uploadRootDir
      if (!absolutePath.startsWith(this.uploadRootDir)) {
        this.logger.warn(`Attempted path traversal deletion: ${fileUrlOrPath}`);
        return;
      }

      if (fsSync.existsSync(absolutePath)) {
        await fs.unlink(absolutePath);
        this.logger.log(`Deleted uploaded file: ${absolutePath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to delete file: ${fileUrlOrPath}`, error);
    }
  }

  /**
   * Delete the entire folder for an order (e.g. if order is deleted or cancelled)
   */
  async deleteOrderFolder(orderIdentifier: string): Promise<void> {
    try {
      const safeOrderFolder = orderIdentifier.replace(/[^a-zA-Z0-9_-]/g, '_');
      const orderDir = path.join(this.uploadRootDir, 'orders', safeOrderFolder);

      if (fsSync.existsSync(orderDir)) {
        await fs.rm(orderDir, { recursive: true, force: true });
        this.logger.log(`Deleted order uploads directory: ${orderDir}`);
      }
    } catch (error) {
      this.logger.error(`Failed to delete order folder: ${orderIdentifier}`, error);
    }
  }
}
