# Vercel Deployment Fix - 404 Error on /api/employee

## Problem
The `/api/employee` route returns 404 on Vercel (live) but works locally.

## Root Cause
The git repository root is `next-app/`, and all correct files are in `next-app/app/api/employee/route.js`. The 404 error on Vercel suggests the deployment configuration is incorrect.

## Solution - Check Vercel Settings

### Step 1: Verify Vercel Root Directory
1. Go to your Vercel Dashboard: https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **General**
4. Scroll to **Root Directory** section
5. **CRITICAL**: Set Root Directory to `next-app` (not empty, not root)
6. If it's currently empty or wrong, change it to `next-app`
7. Click **Save**

### Step 2: Verify Build Settings
In the same **Settings** → **General** page:
- **Build Command**: Should be `npm run build` (runs in next-app directory)
- **Output Directory**: Should be `.next` (default)
- **Install Command**: Should be `npm install`

### Step 3: Redeploy
1. After changing Root Directory, Vercel will ask to redeploy
2. Click **Redeploy** or push a new commit
3. Wait for build to complete (check build logs)

### Step 4: Check Build Logs
1. Go to **Deployments** tab
2. Click on the latest deployment
3. Check **Build Logs** for any errors
4. Look for messages about `/api/employee` route

## Files Verification
✅ Route file exists: `next-app/app/api/employee/route.js`
✅ All dependencies exist in `next-app/lib/`
✅ Route exports GET, POST, DELETE correctly
✅ Runtime config is set: `export const runtime = 'nodejs'`

## If Still Not Working
1. Check Vercel Function Logs for runtime errors
2. Verify environment variables (MONGO_URI, etc.) are set in Vercel
3. Check if route appears in Vercel's Function list after deployment

