/* eslint-disable new-cap*/
import NextAuth, { Awaitable, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import jwt, { VerifyOptions } from "jsonwebtoken";
import { JWT, JWTDecodeParams, Secret } from "next-auth/jwt";
import ip from "ip";

export default NextAuth({
  providers: [
    CredentialsProvider({
      id: "login-credentials",
      name: "Credentials",
      credentials: {
        username: {
          label: "Username",
          type: "text",
          placeholder: "Username",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      /**
       * @param {(Record<"username" | "password", string> | undefined)} credentials
       * @return {*}
       */
      async authorize(
        credentials: Record<"username" | "password", string> | undefined
      ) {
        if (credentials == undefined) {
          return null;
        }
        // Initialize hasura credentials in order to make API call
        const hasuraProps = {
          hasuraSecret: process.env
            .NEXT_PUBLIC_HASURA_GRAPHQL_ADMIN_SECRET as String,
          hasuraEndpoint: process.env.NEXT_PUBLIC_HASURA_GRAPHQL_ENDPOINT as
            | RequestInfo
            | URL,
        };

        const hasuraHeaders = {
          "Content-Type": "application/json",
          "x-hasura-admin-secret": hasuraProps.hasuraSecret,
        } as unknown as HeadersInit;

        // Fetch current IP address
        var ipAddress = ip.address();

        // // Modify IP address to forward to docker container
        // ipAddress =
        //   ipAddress.substring(0, ipAddress.lastIndexOf(".") + 1) +
        //   (parseInt(ipAddress.substring(ipAddress.length - 1)) + 1).toString();

        let res;
        try {
          const dockerIP1 = ipAddress.substring(0, ipAddress.lastIndexOf(".") + 1) +
          (parseInt(ipAddress.substring(ipAddress.length - 1)) + 1).toString();
          // GET request to REST endpoint of Hasura to fetch all users
          res = await fetch(`http://${dockerIP1}:8080/api/rest/users`, {
            method: "GET",
            headers: hasuraHeaders,
          });
        } catch {
          const dockerIP2 = ipAddress.substring(0, ipAddress.lastIndexOf(".") + 1) +
          (parseInt(ipAddress.substring(ipAddress.length - 1))).toString();
          // GET request to REST endpoint of Hasura to fetch all users
          res = await fetch(`http://${dockerIP2}:8080/api/rest/users`, {
            method: "GET",
            headers: hasuraHeaders,
          });
        }
        

        // Parse response as JSON
        const usersData = await res.json();

        // Filter through users to find matching username
        // @ts-ignore: Object is possibly 'null'. eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const user = usersData.users.filter(
          (user: {
            id: number;
            name: string;
            password: string;
            role: string;
          }) => user.name === credentials.username
        );

        // If user is not found, credentials are invalid
        if (!user || user === undefined) {
          return null;
        }

        // Check validity of password with bcrypt
        const passwordCheck = await bcrypt.compare(
          credentials.password,
          user[0].password
        );

        // If password is invalid, credentials are invalid
        if (!res.ok || !passwordCheck) {
          return null;
        } else {
          // If password is valid, return user
          return user[0];
        }
      },
    }),
  ],
  secret: process.env.JWT_SECRET, // base64 JWT secret
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    /**
     * Create Hasura-specific JWT token
     * @param param0
     * @returns
     */
    encode: async ({ secret, token }) => {
      // Initialize Hasura-specific JWT claims
      const generateAllowedRoles = (token: JWT | undefined) => {
        // Initialize allowed roles
        let allowedRoles = [];

        // If user is admin, add admin role to allowed roles
        if (token!.role === "admin") {
          allowedRoles.push("admin", "editor", "user");
        } else if (token!.role === "editor") {
          allowedRoles.push("editor", "user");
        } else if (token!.role === "user") {
          allowedRoles.push("user");
        }

        // Return allowed roles
        return allowedRoles;
      };

      const jwtClaims = {
        // @ts-ignore
        sub: token!.id !== undefined ? token!.id.toString() : token!.sub,
        name: token!.name,
        admin: token!.role == "admin",
        iat: Date.now() / 1000,
        "https://hasura.io/jwt/claims": {
          "x-hasura-allowed-roles": generateAllowedRoles(token),
          "x-hasura-default-role": token!.role,
        },
        role: token!.role,
      } as JWT;

      // JWT tokens are only valid if encoded/signed
      const encodedToken = jwt.sign(jwtClaims, secret, {
        algorithm: "HS256",
        expiresIn: "12h",
      });

      return encodedToken as Awaitable<string>;
    },
    /**
     * Decode\Verify Hasura-specific JWT token
     * @param params
     * @returns
     */
    decode: async ({ secret, token }: JWTDecodeParams) => {
      // Token needs to be decoded to be "verified"
      const decodedToken = jwt.verify(
        token as string,
        secret as Secret,
        {
          algorithms: ["HS256"],
        } as VerifyOptions
      );

      return decodedToken as Awaitable<JWT>;
    },
  },
  callbacks: {
    /**
     * Called after a user has been successfully authenticated.
     *
     * @param {*} params
     * @return {*}
     */
    async jwt({ token, user }) {
      if (user) {
        token.user = user;
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    /**
     * @param {*} { session, token }
     * @return {*}
     */
    async session({ session, token }) {
      session.user = token.user as User;
      const encodedToken = jwt.sign(token, process.env.JWT_SECRET as Secret, {
        algorithm: "HS256",
      });
      session.token = encodedToken;
      return session;
    },
  },
});
