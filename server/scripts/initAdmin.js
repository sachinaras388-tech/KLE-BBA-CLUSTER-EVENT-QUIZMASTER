const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');

async function setup() {
  await mongoose.connect(env.MONGODB_URI);
  const passwordHash = await User.hashPassword('AdminPassword123!');
  
  let admin = await User.findOne({ username: 'admin' });
  if (!admin) {
    admin = await User.findOne({ email: 'admin@quizmaster.com' });
  }

  if (admin) {
    admin.username = 'admin';
    admin.email = 'admin@quizmaster.com';
    admin.name = 'QuizMaster Administrator';
    admin.role = 'admin';
    admin.passwordHash = passwordHash;
    admin.mustChangePassword = false;
    admin.isActive = true;
    admin.failedLoginCount = 0;
    admin.lockUntil = null;
    await admin.save();
    console.log('Admin account updated:', admin.username, admin.email);
  } else {
    admin = await User.create({
      username: 'admin',
      email: 'admin@quizmaster.com',
      name: 'QuizMaster Administrator',
      role: 'admin',
      passwordHash,
      mustChangePassword: false,
      isActive: true,
      failedLoginCount: 0,
    });
    console.log('Admin account created:', admin.username, admin.email);
  }
}

setup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Setup failed:', err.message);
    process.exit(1);
  });
