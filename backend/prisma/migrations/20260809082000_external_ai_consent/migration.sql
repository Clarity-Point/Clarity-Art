-- Explicit, revocable consent before personal content may be sent to a
-- non-local AI provider.
ALTER TABLE "Profile"
ADD COLUMN "aiDataConsentAt" TIMESTAMP(3);
