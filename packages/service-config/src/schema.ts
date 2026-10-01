import { z } from "zod";

export const logLevelSchema = z.enum([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
]);

const portSchema = z.number().int().min(1).max(65535);

const platformSchema = z.strictObject({
  serviceSecret: z.string().min(1),
  setupSecret: z.string().min(1),
  jwtPublicKeyPath: z.string().min(1),
});

const resetLinkTemplateSchema = z
  .string()
  .min(1)
  .refine((value) => value.match(/\{token\}/g)?.length === 1, {
    message: "resetLinkTemplate must contain exactly one {token} placeholder.",
  });

const resetNoSendFloorMsSchema = z.number().int().min(0).lt(2000);

const ownerPetManagerSchema = z.strictObject({
  port: portSchema,
  logLevel: logLevelSchema,
  authBaseUrl: z.string().min(1),
  communityBaseUrl: z.string().min(1),
  platformClientActive: z.boolean(),
  databaseUrl: z.string().min(1),
});

const petHealthServiceSchema = z.strictObject({
  port: portSchema,
  logLevel: logLevelSchema,
  authBaseUrl: z.string().min(1),
  platformClientActive: z.boolean(),
  databaseUrl: z.string().min(1),
});

const activityManagerSchema = z.strictObject({
  port: portSchema,
  logLevel: logLevelSchema,
  authBaseUrl: z.string().min(1),
  platformClientActive: z.boolean(),
  databaseUrl: z.string().min(1),
});

const authenticationServiceSchema = z.strictObject({
  port: portSchema,
  logLevel: logLevelSchema,
  ownerPetManagerBaseUrl: z.string().min(1),
  resetNoSendFloorMs: resetNoSendFloorMsSchema,
  platformClientActive: z.boolean(),
  databaseUrl: z.string().min(1),
  jwtPrivateKeyPath: z.string().min(1),
  resetLinkTemplate: resetLinkTemplateSchema,
  mailSink: z.string().min(1).optional(),
});

const communityCollaboratorSchema = z.strictObject({
  port: portSchema,
  logLevel: logLevelSchema,
  authBaseUrl: z.string().min(1),
  communityOwnerIds: z.array(z.string().min(1)),
  platformClientActive: z.boolean(),
});

export const mergedConfigSchema = z.strictObject({
  platform: platformSchema,
  ownerPetManager: ownerPetManagerSchema,
  petHealthService: petHealthServiceSchema,
  activityManager: activityManagerSchema,
  authenticationService: authenticationServiceSchema,
  communityCollaborator: communityCollaboratorSchema,
});

export type MergedConfig = z.infer<typeof mergedConfigSchema>;
export type PlatformConfig = z.infer<typeof platformSchema>;
export type OwnerPetManagerConfig = z.infer<typeof ownerPetManagerSchema>;
export type PetHealthServiceConfig = z.infer<typeof petHealthServiceSchema>;
export type ActivityManagerConfig = z.infer<typeof activityManagerSchema>;
export type AuthenticationServiceConfig = z.infer<typeof authenticationServiceSchema>;
export type CommunityCollaboratorConfig = z.infer<typeof communityCollaboratorSchema>;
