# Vercel Environment Variables Setup Guide

## Problem: Employee Data Not Showing on Live

If employee data shows locally but not on Vercel (live), it's usually due to missing or incorrect environment variables.

## Step 1: Check Environment Variables in Vercel

1. Go to your Vercel Dashboard: https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Verify these variables are set:

### Required Variables:

1. **MONGO_URI** (CRITICAL)
   - This is your MongoDB connection string
   - Format: `mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority`
   - Or: `mongodb://username:password@host:port/database`
   - **Make sure this is set for Production, Preview, and Development environments**

2. **NEXTAUTH_SECRET** (if using NextAuth)
   - A random secret string for session encryption
   - Generate one: `openssl rand -base64 32`

3. **NEXTAUTH_URL** (if using NextAuth)
   - Your production URL: `https://your-domain.vercel.app`

## Step 2: Verify Variable Names

⚠️ **IMPORTANT**: The code uses `MONGO_URI` (not `MONGODB_URI`)

Check that your Vercel environment variable is named exactly: `MONGO_URI`

## Step 3: Redeploy After Adding Variables

1. After adding/updating environment variables in Vercel
2. Go to **Deployments** tab
3. Click the **three dots** (⋯) on the latest deployment
4. Select **Redeploy**
5. Wait for the deployment to complete

## Step 4: Check Vercel Function Logs

1. Go to **Deployments** tab
2. Click on the latest deployment
3. Click **Functions** tab
4. Click on `/api/employee` function
5. Check the **Logs** tab for any errors

Common errors you might see:
- `Please define MONGO_URI in .env.local` → Environment variable not set
- `MongoNetworkError` → Database connection failed
- `Authentication failed` → Wrong MongoDB credentials

## Step 5: Test the API Directly

1. Open your live site: `https://your-domain.vercel.app`
2. Open browser DevTools (F12)
3. Go to **Network** tab
4. Navigate to the employee manage page
5. Look for the `/api/employee` request
6. Check the response:
   - If it returns 500 error → Check Vercel Function Logs
   - If it returns empty `items: []` → Database might be empty or query is filtering everything
   - If it returns 404 → Route not found (check Vercel Root Directory)

## Step 6: Verify Database Connection

Test your MongoDB connection string:
1. Copy your `MONGO_URI` from Vercel
2. Test it locally in a MongoDB client or using `mongosh`
3. Make sure the database and collection exist
4. Verify you can query the `employees` collection

## Quick Checklist

- [ ] `MONGO_URI` is set in Vercel Environment Variables
- [ ] `MONGO_URI` is set for **Production** environment
- [ ] Variable name is exactly `MONGO_URI` (case-sensitive)
- [ ] MongoDB connection string is valid and accessible
- [ ] Database contains employee data
- [ ] Redeployed after adding/updating variables
- [ ] Checked Vercel Function Logs for errors

## Still Not Working?

1. Check Vercel Function Logs for detailed error messages
2. Verify the MongoDB connection string works from outside your network
3. Check MongoDB Atlas IP whitelist (if using Atlas) - add `0.0.0.0/0` for Vercel
4. Verify database name and collection names match your code

