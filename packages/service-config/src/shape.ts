export const SERVICE_SECTIONS = [
  "ownerPetManager",
  "petHealthService",
  "activityManager",
  "authenticationService",
  "communityCollaborator",
] as const;

export type ServiceSection = (typeof SERVICE_SECTIONS)[number];

export const PLATFORM_KEYS = ["serviceSecret", "setupSecret", "jwtPublicKeyPath"] as const;

export const SHARED_SERVICE_KEYS: Record<ServiceSection, readonly string[]> = {
  ownerPetManager: [
    "port",
    "logLevel",
    "authBaseUrl",
    "communityBaseUrl",
    "platformClientActive",
  ],
  petHealthService: ["port", "logLevel", "authBaseUrl", "platformClientActive"],
  activityManager: ["port", "logLevel", "authBaseUrl", "platformClientActive"],
  authenticationService: [
    "port",
    "logLevel",
    "ownerPetManagerBaseUrl",
    "resetNoSendFloorMs",
    "platformClientActive",
  ],
  communityCollaborator: [
    "port",
    "logLevel",
    "authBaseUrl",
    "communityOwnerIds",
    "platformClientActive",
  ],
};

export const INSTANCE_SERVICE_EXTRA_KEYS: Record<ServiceSection, readonly string[]> = {
  ownerPetManager: ["databaseUrl"],
  petHealthService: ["databaseUrl"],
  activityManager: ["databaseUrl"],
  authenticationService: [
    "databaseUrl",
    "jwtPrivateKeyPath",
    "resetLinkTemplate",
    "mailSink",
  ],
  communityCollaborator: [],
};

export const MERGED_SERVICE_KEYS: Record<ServiceSection, readonly string[]> = {
  ownerPetManager: [...SHARED_SERVICE_KEYS.ownerPetManager, "databaseUrl"],
  petHealthService: [...SHARED_SERVICE_KEYS.petHealthService, "databaseUrl"],
  activityManager: [...SHARED_SERVICE_KEYS.activityManager, "databaseUrl"],
  authenticationService: [
    ...SHARED_SERVICE_KEYS.authenticationService,
    "databaseUrl",
    "jwtPrivateKeyPath",
    "resetLinkTemplate",
    "mailSink",
  ],
  communityCollaborator: [...SHARED_SERVICE_KEYS.communityCollaborator],
};

export function keysForSharedRoot(): readonly string[] {
  return SERVICE_SECTIONS;
}

export function keysForInstanceRoot(): readonly string[] {
  return ["platform", ...SERVICE_SECTIONS];
}
