import { Request, Response, NextFunction } from 'express';
import { expressjwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import pool from '../config/db'; 
// Auth0 config
const authConfig = {
  domain: process.env.AUTH0_DOMAIN as string,
  audience: process.env.AUTH0_AUDIENCE as string,
};

//extended request with both Auth0 data and your database user
export interface AuthenticatedRequest extends Request {
  auth?: {
    sub: string;
    email?: string;
  };
  user?: {
    user_id: number; 
  };
}

//first validate JWT, then map to database user
export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const jwtMiddleware = expressjwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${authConfig.domain}/.well-known/jwks.json`,
    }),
    audience: authConfig.audience,
    issuer: `https://${authConfig.domain}/`,
    algorithms: ['RS256']
  });

  //run JWT validation middleware
  jwtMiddleware(req, res, async (err) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    try {
      //JWT is valid, now find the user in your database
      //the auth0 user ID is in req.auth.sub
      if (req.auth?.sub) {
        const userResult = await pool.query(
          'SELECT * FROM users WHERE auth0_id = $1',
          [req.auth.sub]
        );

        if (userResult.rows.length > 0) {
          // Set req.user to your database user
          req.user = {
            user_id: userResult.rows[0].user_id
          };
          next();
        } else {
          return res.status(401).json({ error: 'User not found in database' });
        }
      } else {
        return res.status(401).json({ error: 'Invalid token payload' });
      }
    } catch (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  });
};