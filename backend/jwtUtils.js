// jwtUtils.js

const jwt = require('jsonwebtoken');

// JWT secret key
const JWT_SECRET = '123';

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user; 
    next();
  });
};
module.exports = { authenticateToken, JWT_SECRET };
