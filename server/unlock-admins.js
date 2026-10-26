const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 }).then(async () => {
  const User = require('./src/models/User');

  const newPassword = 'QuizMaster@2024!';
  const hash = await User.hashPassword(newPassword);

  // Unlock + reset password for all admins
  const result = await User.updateMany(
    { role: 'admin' },
    {
      $set: {
        failedLoginCount: 0,
        mustChangePassword: false,
        isActive: true,
        passwordHash: hash,
        tokenVersion: 1,
      },
      $unset: { lockUntil: 1 },
    }
  );
  console.log('Updated admin accounts:', result.modifiedCount);
  console.log('New password:', newPassword);

  const admins = await User.find({ role: 'admin' }).select('email username name failedLoginCount isActive mustChangePassword').lean();
  console.log('Admin state:', JSON.stringify(admins, null, 2));

  await mongoose.disconnect();
}).catch((e) => {
  console.error('DB error:', e.message);
  process.exit(1);
});
