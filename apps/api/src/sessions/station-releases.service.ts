import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { StationRelease } from "@oyna/contracts";
import { createHash } from "node:crypto";
import { DatabaseService } from "../database/database.service";

interface StoredRelease {
  version: string;
  sha256: string;
  signature: string;
  binary: Buffer;
  createdAt: number;
}

export const MAX_RELEASE_BYTES = 50 * 1024 * 1024;

function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) if (left[index] !== right[index]) return left[index] - right[index];
  return 0;
}

/**
 * Обновления Vence для компьютеров. Сервер подпись не проверяет и проверять не должен: ключ
 * подписи есть только у разработчика, и даже взломанный сервер не выпустит обновление,
 * которое компьютеры примут.
 */
@Injectable()
export class StationReleasesService {
  private readonly memory = new Map<string, StoredRelease>();

  constructor(private readonly database: DatabaseService) {}

  async publish(version: string, signature: string, binary: Buffer): Promise<StationRelease> {
    if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) throw new BadRequestException("Версия в виде 1.2.3");
    if (!/^[0-9a-f]{128}$/.test(signature ?? "")) throw new BadRequestException("Подпись — 64 байта в hex");
    if (!Buffer.isBuffer(binary) || binary.length === 0) throw new BadRequestException("Пришлите Vence.exe телом запроса (application/octet-stream)");
    if (binary.length > MAX_RELEASE_BYTES) throw new BadRequestException("Файл больше 50 МБ");
    const sha256 = createHash("sha256").update(binary).digest("hex");
    if (!this.database.configured) {
      this.memory.set(version, { version, sha256, signature, binary, createdAt: Date.now() });
    } else {
      await this.database.query(
        `INSERT INTO station_releases (version, sha256, signature, size, file) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (version) DO UPDATE SET sha256 = EXCLUDED.sha256, signature = EXCLUDED.signature, size = EXCLUDED.size, file = EXCLUDED.file, created_at = NOW()`,
        [version, sha256, signature, binary.length, binary]
      );
    }
    return this.toPublic(version, sha256, signature, binary.length);
  }

  async latest(): Promise<StationRelease | null> {
    if (!this.database.configured) {
      const release = [...this.memory.values()].sort((a, b) => compareVersions(b.version, a.version))[0];
      return release ? this.toPublic(release.version, release.sha256, release.signature, release.binary.length) : null;
    }
    const result = await this.database.query<{ version: string; sha256: string; signature: string; size: number }>(
      // Наибольшая версия, а не последняя загруженная: перезалив старой не откатывает компьютеры.
      "SELECT version, sha256, signature, size FROM station_releases ORDER BY string_to_array(version, '.')::int[] DESC LIMIT 1"
    );
    const row = result.rows[0];
    return row ? this.toPublic(row.version, row.sha256, row.signature, row.size) : null;
  }

  async binary(version: string): Promise<Buffer> {
    if (!this.database.configured) {
      const release = this.memory.get(version);
      if (!release) throw new NotFoundException("Нет такой версии");
      return release.binary;
    }
    const result = await this.database.query<{ file: Buffer }>("SELECT file FROM station_releases WHERE version = $1", [version]);
    if (!result.rows[0]) throw new NotFoundException("Нет такой версии");
    return result.rows[0].file;
  }

  private toPublic(version: string, sha256: string, signature: string, size: number): StationRelease {
    return { version, sha256, signature, size, url: `/api/stations/release/${version}/Vence.exe` };
  }
}
