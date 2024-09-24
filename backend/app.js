require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const app = express();
const { connectDB, User, BudgetEntry,Notification  } = require('./mongo');
const PORT = 8002;
const multer = require('multer');
const path = require('path');
const { authenticateToken, JWT_SECRET } = require('./jwtUtils');


// Middleware
app.use(cors());
app.use(bodyParser.json());


// Nodemailer transporter 
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS  
  }
});
// Middleware to verify JWT

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Save files to 'uploads' directory
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname)); // Save files with unique names
  }
});

const upload = multer({ storage });
// async function createAdmin() {
//   const hashedPassword = await bcrypt.hash('test@1234', 10);
//   const admin = new User({
//     firstName: 'Admin',
//     lastName: 'User',
//     email: 'admin@emumba.com',
//     password: hashedPassword,
//     role: 'admin',
//   });
//   await admin.save();
//   console.log('Admin user created');
// }

// createAdmin();

// User signup route
app.post('/api/auth/signup', async (req, res) => {
  const { firstName, lastName, email, password, budgetLimit } = req.body;

  if (!firstName || !lastName || !email || !password || !budgetLimit) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  if (budgetLimit < 1 || budgetLimit > 99999999) {
    return res.status(400).json({ message: 'Budget limit must be between 1 and 99999999' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ firstName, lastName, email, password: hashedPassword, budgetLimit });
    await newUser.save();

    const token = jwt.sign({ id: newUser._id }, JWT_SECRET, { expiresIn: '1d' });

    res.status(201).json({ token, user: newUser });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// User login route
app.post('/api/auth/login', async (req, res) => {
  const { email, password, rememberMe } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: rememberMe ? '7d' : '1d' });
    res.json({ token, role: user.role });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Password reset request route
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User with this email does not exist' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // expiry of the link that i have sended in the mail in 10 min
    await user.save();

    const resetUrl = `http://localhost:4200/reset-password/${resetToken}`;


    const message = `
      <h1>Password Reset Request</h1>
      <p>You requested to reset your password. Please click on the link below to reset your password:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>This link will expire in 10 minutes.</p>
    `;

    await transporter.sendMail({
      to: user.email,
      subject: 'Password Reset',
      html: message,
    });

    res.status(200).json({ message: 'Email sent' });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Error sending email' });
  }
});


//this is for the jwt token
app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is a protected route', user: req.user, role: req.user.role });
});
  // Password reset route
app.post('/api/auth/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    const { newPassword } = req.body;
  
    // pass policy check
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }
  
    try {
      // this is the hashed token
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
      // in here finding the user with the valid token 
      const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpire: { $gt: Date.now() },
      });
  
      if (!user) {
        return res.status(400).json({ message: 'Invalid or expired token' });
      }
  
      //in this i am hashing the new password and updating the new password
      user.password = await bcrypt.hash(newPassword, 10);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();
  
      res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
      console.error(error.message);
      res.status(500).json({ message: 'Server error' });
    }
  });
app.post('/api/budget', authenticateToken, async (req, res) => {
  const { expense, pricePKR, date } = req.body;

  try {
    // Fetch the user's budget limit
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const budgetLimit = user.budgetLimit;

    // Fetch all entries for the user
    const entries = await BudgetEntry.find({ userId: req.user.id });
    

    // Calculate the total expenditure percentage so far
    const totalExpenditurePercentageSoFar = entries.reduce((sum, entry) => entry.totalExpenditure, 0);

    // Calculate the new entry's percentage
    const newEntryPercentage = (pricePKR / budgetLimit) * 100;

    // Calculate the new total expenditure percentage
    const newTotalExpenditurePercentage = totalExpenditurePercentageSoFar + newEntryPercentage;


    const newEntry = new BudgetEntry({
      userId: req.user.id,
      date,
      expense,
      pricePKR,
      totalExpenditure: newTotalExpenditurePercentage
    });
    await newEntry.save();
     // Create a notification
     const notification = new Notification({
        type: 'added',
        expenseId: newEntry._id,
        message: ` ${newEntry.expense}`,
        seen: false,
        userId: req.user.id,
      });
      await notification.save();
  

    res.status(201).json(newEntry);
  } catch (error) {
    console.error('Error adding budget entry:', error);
    res.status(500).json({ message: error.message });
  }
});

  
app.get('/api/budget', authenticateToken, async (req, res) => {
  try {
    const role = req.query.role;
    const date = req.query.date; // Add this line

    let entries;

    if (role === 'admin') {
      if (date) {
        entries = await BudgetEntry.find({ date: new Date(date) })
          .populate('userId', 'firstName lastName')
          .select('expense pricePKR date totalExpenditure userId');
      } else {
        entries = await BudgetEntry.find()
          .populate('userId', 'firstName lastName')
          .select('expense pricePKR date totalExpenditure userId');
      }
    } else {
      if (date) {
        entries = await BudgetEntry.find({ userId: req.user.id, date: new Date(date) })
          .populate('userId', 'firstName lastName')
          .select('expense pricePKR date totalExpenditure userId');
      } else {
        entries = await BudgetEntry.find({ userId: req.user.id })
          .populate('userId', 'firstName lastName')
          .select('expense pricePKR date totalExpenditure userId');
      }
    }

    if (!entries) {
      return res.status(404).json({ msg: 'No entries found' });
    }

    res.status(200).json(entries);
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: 'Internal Server Error' });
  }
});

app.delete('/api/budget/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const role = req.user.role;

    // Find the entry to be deleted
    let entryToDelete;
    if (role === 'admin') {
      entryToDelete = await BudgetEntry.findById(id);
    } else {
      entryToDelete = await BudgetEntry.findById(id).where('userId').equals(req.user.id);
    }

    if (!entryToDelete) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    // Delete the entry from the database
    await BudgetEntry.findByIdAndDelete(id);

    // Create notifications
    if (entryToDelete) {
      // Create notification for the user who owns the entry
      const userNotification = new Notification({
        type: 'deleted',
        expenseId: id,
        message: `${entryToDelete.expense}`,
        seen: false,
        userId: entryToDelete.userId,
      });
      await userNotification.save();

      // Create notification for the admin
      if (role === 'admin') {
        const adminNotification = new Notification({
          type: 'deleted',
          expenseId: id,
          message: `${entryToDelete.expense}`,
          seen: false,
          userId: req.user.id, // Admin's ID
        });
        await adminNotification.save();
      }
    }
    // Recalculate percentages for remaining entries
    if (role === 'admin') {
      const users = await User.find();
      for (const user of users) {
        const entries = await BudgetEntry.find({ userId: user._id });
        const budgetLimit = user.budgetLimit;
        let totalExpenditurePercentageSoFar = 0;
        for (const entry of entries) {
          let entryPercentage = (entry.pricePKR / budgetLimit) * 100;
          entryPercentage = parseFloat(entryPercentage.toFixed(2)); // Round to two decimal places
          totalExpenditurePercentageSoFar += entryPercentage;
          entry.totalExpenditure = parseFloat(totalExpenditurePercentageSoFar.toFixed(2)); // Round to two decimal places
          await entry.save();
        }
      }
    } else {
      const entries = await BudgetEntry.find({ userId: entryToDelete.userId }); // Use entryToDelete.userId instead of req.user.id
      const user = await User.findById(entryToDelete.userId); // Use entryToDelete.userId instead of req.user.id
      const budgetLimit = user.budgetLimit;
      let totalExpenditurePercentageSoFar = 0;
      for (const entry of entries) {
        let entryPercentage = (entry.pricePKR / budgetLimit) * 100;
        entryPercentage = parseFloat(entryPercentage.toFixed(2)); // Round to two decimal places
        totalExpenditurePercentageSoFar += entryPercentage;
        entry.totalExpenditure = parseFloat(totalExpenditurePercentageSoFar.toFixed(2)); // Round to two decimal places
        await entry.save();
      }
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting entry:', error);
    res.status(500).send();
  }
});
app.put('/api/budget/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const updates = req.body;
    const role = req.user.role;

    // Find and update entry
    let entry;
    if (role === 'admin') {
      entry = await BudgetEntry.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    } else {
      entry = await BudgetEntry.findByIdAndUpdate(id, updates, { new: true, runValidators: true }).where('userId').equals(req.user.id);
    }

    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    // Create notifications for both admin and user
    // const adminNotification = new Notification({
    //   type: 'updated',
    //   expenseId: entry._id,
    //   message: `${entry.expense}`,
    //   seen: false,
    //   userId: req.user.id, // Admin's ID
    // });
    // await adminNotification.save();

    const userNotification = new Notification({
      type: 'updated',
      expenseId: entry._id,
      message: `${entry.expense}`,
      seen: false,
      userId: entry.userId, // User's ID
    });
    await userNotification.save();
    if (role === 'admin') {
      const users = await User.find();
      for (const user of users) {
        const entries = await BudgetEntry.find({ userId: user._id });
        const budgetLimit = user.budgetLimit;
        let totalExpenditurePercentageSoFar = 0;
        for (const entry of entries) {
          let entryPercentage = (entry.pricePKR / budgetLimit) * 100;
          entryPercentage = parseFloat(entryPercentage.toFixed(2)); // Round to two decimal places
          totalExpenditurePercentageSoFar += entryPercentage;
          entry.totalExpenditure = parseFloat(totalExpenditurePercentageSoFar.toFixed(2)); // Round to two decimal places
          await entry.save();
        }
      }
    } else {
      const entries = await BudgetEntry.find({ userId: entry.userId }); // Use entry.userId instead of req.user.id
      const user = await User.findById(entry.userId); // Use entry.userId instead of req.user.id
      const budgetLimit = user.budgetLimit;
      let totalExpenditurePercentageSoFar = 0;
      for (const entry of entries) {
        let entryPercentage = (entry.pricePKR / budgetLimit) * 100;
        entryPercentage = parseFloat(entryPercentage.toFixed(2)); // Round to two decimal places
        totalExpenditurePercentageSoFar += entryPercentage;
        entry.totalExpenditure = parseFloat(totalExpenditurePercentageSoFar.toFixed(2)); // Round to two decimal places
        await entry.save();
      }
    }

    res.status(200).send(entry);
  } catch (error) {
    console.error('Error updating entry:', error);
    res.status(500).send();
  }
});
//api to update the scene field of the notification 
app.put('/api/notifications/all/seen', authenticateToken, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id }, { seen: true });
    res.status(200).json({ message: 'All notifications marked as seen' });
  } catch (error) {
    console.error('Error marking all notifications as seen:', error);
    res.status(500).json({ message: error.message });
  }
});
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id, seen: false }).select('id type message createdAt seen');
    res.status(200).json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
app.get('/api/budget/analysis', authenticateToken, async (req, res) => {
  const filter = req.query.filter;
  let startDate = new Date();
  let endDate = new Date(); 

  switch (filter) {
      case 'Last Month':
          startDate.setDate(1); 
          startDate.setMonth(startDate.getMonth() - 1); 
          endDate.setMonth(startDate.getMonth() + 1); 
          break;
      case 'Last 6 Months':
          startDate.setMonth(startDate.getMonth() - 6);
          break;
      case 'Last 12 Months':
          startDate.setMonth(startDate.getMonth() - 12);
          break;
      default:
          startDate.setDate(1);
          startDate.setMonth(startDate.getMonth() - 1);
          endDate.setMonth(startDate.getMonth() + 1);
  }

  try {
      const budgetEntries = await BudgetEntry.find({
          userId: req.user.id,
          date: { $gte: startDate, $lte: endDate } 
      }).sort({ date: 1 });

        const totalSpentByDate = budgetEntries.reduce((acc, entry) => {
            const date = new Date(entry.date).toLocaleDateString();
            if (!acc[date]) {
                acc[date] = 0;
            }
            acc[date] += entry.pricePKR;
            return acc;
        }, {});

        const labels = Object.keys(totalSpentByDate);
        const data = Object.values(totalSpentByDate);

        const totalSpent = data.reduce((acc, amount) => acc + amount, 0);
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const isLimitExceeded = totalSpent > user.budgetLimit;

        res.json({ labels, data, isLimitExceeded });
    } catch (error) {
        console.error('Error fetching budget data:', error);
        res.status(500).json({ error: 'Error fetching budget data' });
    }
});
//profile update in the profile section
app.put('/api/user/update', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      firstName,
      lastName,
      jobTitle,
      street,
      city,
      state,
      zipCode,
      completeAddress,
      phoneNumber,
      email,
      dob,
      education,
      gender,
      budgetLimit,
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Update user information
    user.firstName = firstName;

    user.lastName = lastName;
    user.jobTitle = jobTitle;
    user.street = street;
    user.city = city;
    user.state = state;
    user.zipCode = zipCode;
    user.completeAddress = completeAddress;
    user.phoneNumber = phoneNumber;
    user.email = email;
    user.dob = dob;
    user.education = education;
    user.gender = gender;
    user.budgetLimit = budgetLimit;
    await user.save();
    res.status(200).json({ msg: 'User profile updated successfully' });
  } catch (error) {
    res.status(500).json({ msg: 'Server error' });
  }
});
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const userData = {
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      email: user.email,
      jobTitle: user.jobTitle,
      street: user.street,
      city: user.city,
      state: user.state,
      zipCode: user.zipCode,
      completeAddress: user.completeAddress,
      phoneNumber: user.phoneNumber,
      dob: user.dob,
      education: user.education,
      gender: user.gender,
      budgetLimit: user.budgetLimit,
    };

    // Validate user data
    if (!userData.firstName || !userData.lastName || !userData.email) {
      return res.status(400).json({ msg: 'Invalid user data' });
    }

    res.status(200).json(userData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: 'Internal Server Error' });
  }
});
//fetching the user for admin
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.find().select([
      'firstName',
      'lastName',
      'role',
      'email',
      'jobTitle',
      'street',
      'city',
      'state',
      'zipCode',
      'completeAddress',
      'phoneNumber',
      'dob',
      'education',
      'gender',
      'budgetLimit',
    ]);

    if (!users) {
      return res.status(404).json({ msg: 'No users found' });
    }

    res.status(200).json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: 'Internal Server Error' });
  }
});
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;

  
    const userToDelete = await User.findById(id);
    if (!userToDelete) {
      return res.status(404).json({ message: 'User not found' });
    }

    await User.findByIdAndDelete(id);

    const notification = new Notification({
      type: 'deleted',
      userId: id,
      message: `User ${userToDelete.firstName} ${userToDelete.lastName} deleted`,
      userId: req.user.id,
    });
    await notification.save();

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).send();
  }
});
app.put('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const { firstName, lastName, phoneNumber, role } = req.body;

    const userToUpdate = await User.findById(id);
    if (!userToUpdate) {
      return res.status(404).json({ message: 'User not found' });
    }

    userToUpdate.firstName = firstName;
    userToUpdate.lastName = lastName;
    userToUpdate.phoneNumber = phoneNumber;
    userToUpdate.role = role;

    await userToUpdate.save();

    res.status(200).json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).send();
  }
});

// API endpoint for image uploads
app.post('/api/user/uploadImage', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const imageUrl = `http://localhost:8002/uploads/${req.file.filename}`; // Save full URL
    const user = await User.findById(req.user.id); // req.user is populated from your authenticateToken middleware
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    user.profileImage = imageUrl; // Save image URL in user profile
    await user.save();
    res.status(200).json({ message: 'Image uploaded successfully', imageUrl });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Serve the uploaded images statically
app.get('/api/user/image', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ imageUrl: user.profileImage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.use('/uploads',  express.static('uploads'));

// starting the server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
