import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

//check for a valid JWT token in the request headers
export interface AuthenticatedRequest extends Request {
  user?: { user_id: number };
}

//authenticate middleware fun
export const authenticateToken = (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  //check if token exists
  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  //verify the token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    req.user = decoded as { user_id: number };
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token' }); //403 forbidden
    return;
  }
}