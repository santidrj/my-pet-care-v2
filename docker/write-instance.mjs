import { writeFileSync } from "node:fs";

const dir = process.env.MPC_DIR;
const serviceSecret = process.env.SERVICE_SECRET;
const setupSecret = process.env.SETUP_SECRET;

if (!dir || !serviceSecret || !setupSecret) {
  throw new Error("MPC_DIR, SERVICE_SECRET, and SETUP_SECRET are required.");
}

const databaseUrl = (name) =>
  `postgresql://my_pet_care:my_pet_care@postgres:5432/${name}`;

const document = {
  platform: {
    serviceSecret,
    setupSecret,
    jwtPublicKeyPath: "/var/lib/mpc/authentication-public.pem",
  },
  ownerPetManager: {
    databaseUrl: databaseUrl("owner_pet_manager"),
    authBaseUrl: "http://authentication-service:3004",
    communityBaseUrl: "http://community-collaborator-stub:3005",
  },
  petHealthService: {
    databaseUrl: databaseUrl("pet_health_service"),
    authBaseUrl: "http://authentication-service:3004",
  },
  activityManager: {
    databaseUrl: databaseUrl("activity_manager"),
    authBaseUrl: "http://authentication-service:3004",
  },
  authenticationService: {
    databaseUrl: databaseUrl("authentication_service"),
    ownerPetManagerBaseUrl: "http://owner-pet-manager:3001",
    jwtPrivateKeyPath: "/var/lib/mpc/authentication-private.pem",
    resetLinkTemplate: "https://example.test/reset?token={token}",
    mailSink: "file:/var/lib/mpc/reset-links.txt",
  },
  communityCollaborator: {
    authBaseUrl: "http://authentication-service:3004",
  },
};

writeFileSync(`${dir}/instance.json`, `${JSON.stringify(document, null, 2)}\n`);
