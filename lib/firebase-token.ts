import { createRemoteJWKSet, jwtVerify } from "jose";

const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export type FirebaseIdentity = {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
};

export async function verifyFirebaseToken(token: string, projectId: string): Promise<FirebaseIdentity> {
  const { payload } = await jwtVerify(token, firebaseKeys, {
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
    algorithms: ["RS256"],
  });

  if (!payload.sub || typeof payload.email !== "string" || payload.email_verified !== true) {
    throw new Error("The identity token does not contain a verified email address.");
  }

  return {
    uid: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}
