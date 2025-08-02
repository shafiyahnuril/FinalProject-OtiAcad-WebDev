import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import userModel from '../models/userModel.js';
import transporter from '../config/nodeMailer.js';

export const register = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({success:false, message: 'Missing details'})
    }
    try {
        const existingUser = await userModel.findOne({ email });
        
        if (existingUser) {
            return res.json({success:false, message: 'User already exists'})}
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new userModel({
            email,
            password: hashedPassword
        });

        await newUser.save();

        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
            expiresIn: '7d'
        });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        
        //Sending welcome email
        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: email,
            subject: 'Welcome to Tools App',
            text: 'Thank you for registering with Tools App! Your account has been created successfully.'
        };

        await transporter.sendMail(mailOptions);

        return res.json({success:true});

    } catch (error) {
        res.json({success:false, message: error.message})
    }
}

export const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({success:false, message: 'Email and password are required'})
    }

    try {
        const user = await userModel.findOne({ email });

        if (!user) {
            return res.json({success:false, message: 'Invalid email'})
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.json({success:false, message: 'Invalid password'})
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: '7d'
        });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.json({
            success: true,
            user: {
                _id: user._id,
                email: user.email,
                isAccountVerified: user.isAccountVerified
                // tambahkan field lain jika perlu
            }
        });

    } catch (error) {
        res.json({success:false, message: error.message})
    }
}

export const logout = (req, res) => {
    try {
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
        });
        return res.json({success:true, message: 'Logged out'});
    } catch (error) {
        return res.json({success:false, message: error.message});
    }
}

//Send OTP for email verification
export const sendVerifyOtp = async (req, res) => {
    try {
        const {userId} = req.body;

        console.log('userId:', userId);
        const user= await userModel.findById(userId);
        console.log('user:', user);

        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        if(user.isAccountVerified) {
            return res.json({success:false, message: 'Account already verified'});
        }

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        user.verifyOtp = otp;
        user.verifyOtpExpireAt = Date.now() + 24 * 60 * 60 * 1000;
        await user.save();
        
        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: user.email,
            subject: 'Verify your Tools App account',
            text: `Your verification OTP is ${otp}. It is valid for 24 hours.`
        };
        
        await transporter.sendMail(mailOptions);
        return res.json({success:true, message: 'OTP sent to your email'});

    } catch (error) {
        return res.json({success:false, message: error.message});
    }}

export const verifyEmail = async (req, res) => {
    const { userId, otp } = req.body;
  
    if (!userId || !otp) {
        return res.json({success:false, message: 'User ID and OTP are required'});
    }

    try{
        const user = await userModel.findById(userId);

        if (!user) {
            return res.json({success:false, message: 'User not found'});
        }

        if (user.verifyOtp === '' || user.verifyOtp !== otp) {
            return res.json({success:false, message: 'Invalid OTP'});
        }

        if (user.verifyOtpExpireAt < Date.now()) {
            return res.json({success:false, message: 'OTP expired'});
        }

        user.isAccountVerified = true;
        user.verifyOtp = '';
        user.verifyOtpExpireAt = 0;

        await user.save();
        return res.json({success:true, message: 'Email verified successfully'});

    } catch (error) {
        return res.json({success:false, message: error.message});
    }
}

export const isAuthenticated = (req, res, next) => {

    try{
        return res.json({success:true});
    } catch (error) {
        return res.json({success:false, message: error.message});
    }
}

//send password reset OTP
export const sendResetOtp = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.json({success:false, message: 'Email is required'});
    }

    try {
        const user = await userModel.findOne({ email });

        if (!user) {
            return res.json({success:false, message: 'User not found'});
        }

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        user.resetOtp = otp;
        user.resetOtpExpireAt = Date.now() + 15 * 60 * 1000;
        await user.save();
        
        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: user.email,
            subject: 'Password Reset OTP',
            text: `Your password reset OTP is ${otp}. It is valid for 15 minutes.`
        };
        
        await transporter.sendMail(mailOptions);
        return res.json({success:true, message: 'OTP sent to your email'});


    } catch (error) {
        return res.json({success:false, message: error.message});
    }
}

export const resetPassword = async (req, res) => {  
    const {email, otp, newPassword} = req.body;

    if(!email || !otp || !newPassword) {
        return res.json({success:false, message: 'Email, OTP and new password are required'});
    }

    try{
        const user = await userModel.findOne({ email });
        
        if(!user) {
            return res.json({success:false, message: 'User not found'});
        }

        if(user.resetOtp === '' || user.resetOtp !== otp) {
            return res.json({success:false, message: 'Invalid OTP'});
        }

        if(user.resetOtpExpireAt < Date.now()) {
            return res.json({success:false, message: 'OTP expired'});
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.resetOtp = '';
        user.resetOtpExpireAt = 0;

        await user.save();
        return res.json({success:true, message: 'Password reset successfully'});

    } catch (error) {
        return res.json({success:false, message: error.message});
    }
}