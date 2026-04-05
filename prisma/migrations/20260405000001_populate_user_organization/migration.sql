-- Populate UserOrganization from existing User data
INSERT INTO "UserOrganization" ("id", "userId", "organizationId", "role", "createdAt")
SELECT gen_random_uuid(), "id", "organizationId", "role", NOW()
FROM "User"
WHERE "organizationId" IS NOT NULL
ON CONFLICT ("userId", "organizationId") DO NOTHING;
