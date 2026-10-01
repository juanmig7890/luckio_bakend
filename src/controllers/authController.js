const jwt = require('jsonwebtoken');
const User = require('../models/User');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const publicUser = (u) => ({
  id: u._id,
  username: u.username,
  email: u.email,
  balance: u.balance,
  totalWagered: u.totalWagered,
  vipLevel: u.vipLevel,
  createdAt: u.createdAt,
});

exports.register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const user = await User.create({
      username,
      email,
      password,
      balance: Number(process.env.INITIAL_BALANCE) || 0,
    });
    res.status(201).json({ token: signToken(user._id), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Correo o contraseña incorrectos' });
    }
    res.json({ token: signToken(user._id), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};

exports.me = async (req, res) => {
  res.json({ user: publicUser(req.user) });
};

exports.publicUser = publicUser;