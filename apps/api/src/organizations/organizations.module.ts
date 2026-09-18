import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { InvitationLookupController } from "./invitation-lookup.controller";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController, InvitationLookupController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
