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
  console.log('Auth middleware called with URL:', req.originalUrl);
  console.log('Auth headers:', req.headers.authorization ? req.headers.authorization.substring(0, 20) + '...' : 'no auth header');
  
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

  console.log('👉 JWT middleware config:', {
    domain: authConfig.domain,
    audience: authConfig.audience,
    jwksUri: `https://${authConfig.domain}/.well-known/jwks.json`,
  });

  // Run JWT validation middleware
  jwtMiddleware(req, res, async (err) => {
    if (err) {
      console.error('JWT validation error:', err.message);
      return res.status(401).json({ error: 'Invalid or expired token', details: err.message });
    }

    console.log('JWT validated successfully, auth payload sub:', req.auth?.sub);
    
    try {
      if (req.auth?.sub) {
        console.log('🔍 Looking for user with auth0_id:', req.auth.sub);
        
        const userResult = await pool.query(
          'SELECT * FROM users WHERE auth0_id = $1',
          [req.auth.sub]
        );
        
        console.log('User lookup result rows:', userResult.rows.length);
        
        if (userResult.rows.length > 0) {
          req.user = {
            user_id: userResult.rows[0].user_id
          };
          console.log('User found, setting user_id:', userResult.rows[0].user_id);
          next();
        } else {
          console.log('User not found in database for auth0_id:', req.auth.sub);
          return res.status(401).json({ error: 'User not found in database' });
        }
      } else {
        console.error('Invalid token payload - missing sub field');
        return res.status(401).json({ error: 'Invalid token payload' });
      }
    } catch (error) {
      console.error('Database error in auth middleware:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  });
};