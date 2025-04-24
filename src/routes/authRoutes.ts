import express, { Request, Response, Router } from 'express';
import pool from '../config/db';

const router: Router = express.Router();

const formatUser = (user: any) => ({
  user_id: user.user_id,
  email: user.email,
});

router.post('/auth0-callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { auth0_id, email } = req.body;

    if (!auth0_id || !email) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const existingUser = await pool.query(
      'SELECT * FROM users WHERE auth0_id = $1',
      [auth0_id]
    );

    if (existingUser.rows.length > 0) {
      res.status(200).json({ user: formatUser(existingUser.rows[0]) });
      return;
    }

    const newUser = await pool.query(
      'INSERT INTO users (email, auth0_id) VALUES ($1, $2) RETURNING *',
      [email, auth0_id]
    );

    res.status(201).json({ user: formatUser(newUser.rows[0]) });
  } catch (err) {
    console.error('Error handling Auth0 callback:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/register-auth0-user', async (req: Request, res: Response): Promise<void> => {
  const { auth0_id, email } = req.body;

  if (!auth0_id || !email) {
    res.status(400).json({ error: 'Missing auth0_id or email' });
    return;
  }

  try {
    const existing = await pool.query(
      'SELECT * FROM users WHERE auth0_id = $1 OR email = $2',
      [auth0_id, email]
    );

    if (existing.rows.length > 0) {
      const user = existing.rows[0];

      if (!user.auth0_id) {
        await pool.query(
          'UPDATE users SET auth0_id = $1 WHERE email = $2',
          [auth0_id, email]
        );
        user.auth0_id = auth0_id;
      }

      res.status(200).json({
        message: 'User already exists or updated',
        user: formatUser(user),
      });
      return;
    }

    const newUser = await pool.query(
      'INSERT INTO users (auth0_id, email) VALUES ($1, $2) RETURNING *',
      [auth0_id, email]
    );

    res.status(201).json({
      message: 'User created',
      user: formatUser(newUser.rows[0]),
    });
  } catch (error: any) {
    console.error('🔥 Error in register-auth0-user:', error);
    res.status(500).json({ error: 'Database error', details: error.message || error });
  }
});

export default router;
