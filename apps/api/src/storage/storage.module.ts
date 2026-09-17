import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { StorageController } from "./storage.controller";
import { StorageService } from "./storage.service";

/**
 * Storage module (spec 21) — presign/confirm/read/delete over the
 * tenant-scoped file table, plus the S3/null adapter behind the contract.
 *
 * The retention purge (`storage.purge`, owned by the jobs registry) deletes
 * through `StorageService.deleteObject`: one adapter owner, so provider
 * selection cannot drift between the foreground endpoints and the
 * background job.
 */
@Module({
  imports: [AuthModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
