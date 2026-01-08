# Vercel Troubleshooting Guide - Employee Data Not Showing

## Quick Diagnosis Steps

### Step 1: Test Health Check Endpoint
1. Open your live site: `https://your-domain.vercel.app/api/health`
2. You should see JSON response like:
   ```json
   {
     "status": "ok",
     "hasMongoUri": true,
     "message": "API is working. MONGO_URI is set."
   }
   ```
3. If `hasMongoUri: false` → **MONGO_URI is missing in Vercel!**

### Step 2: Test Employee API Directly
1. Open: `https://your-domain.vercel.app/api/employee?page=1&limit=50`
2. Check the response:
   - **200 OK** with `{"items": [...]}` → API works, check frontend
   - **500 Error** with database error → Check MONGO_URI
   - **404 Not Found** → Route not deployed, check Vercel Root Directory

### Step 3: Check Vercel Environment Variables
1. Go to: https://vercel.com/dashboard
2. Select your project
3. **Settings** → **Environment Variables**
4. Verify:
   - ✅ `MONGO_URI` exists
   - ✅ Set for **Production** environment
   - ✅ Variable name is exactly `MONGO_URI` (case-sensitive)
   - ✅ Value is correct MongoDB connection string

### Step 4: Check Vercel Function Logs
1. Go to **Deployments** tab
2. Click latest deployment
3. Click **Functions** tab
4. Click `/api/employee`
5. Click **Logs** tab
6. Look for errors:
   - `Please define MONGO_URI` → Environment variable missing
   - `MongoNetworkError` → Database connection failed
   - `Authentication failed` → Wrong MongoDB credentials

### Step 5: Check Browser Console
1. Open your live site
2. Press F12 (DevTools)
3. Go to **Console** tab
4. Navigate to employee manage page
5. Look for errors:
   - Red errors about `/api/employee`
   - Network errors
   - CORS errors

### Step 6: Check Network Tab
1. Open DevTools → **Network** tab
2. Navigate to employee manage page
3. Find `/api/employee` request
4. Check:
   - **Status**: Should be 200 (not 500 or 404)
   - **Response**: Should have `items` array
   - **Headers**: Check for CORS issues

## Common Issues & Solutions

### Issue 1: "Database connection failed"
**Solution:**
- Verify `MONGO_URI` is set in Vercel
- Check MongoDB Atlas IP whitelist (add `0.0.0.0/0` for Vercel)
- Verify connection string is correct

### Issue 2: "404 Not Found" on `/api/employee`
**Solution:**
- Check Vercel **Root Directory** is set to `next-app`
- Verify file exists: `next-app/app/api/employee/route.js`
- Redeploy after fixing Root Directory

### Issue 3: Empty `items: []` array
**Solution:**
- Database might be empty
- Check if employees exist in MongoDB
- Verify database name matches your connection string

### Issue 4: CORS Errors
**Solution:**
- Usually not an issue with Next.js API routes
- Check if middleware is blocking requests

## Verification Checklist

- [ ] Health check endpoint works: `/api/health`
- [ ] `MONGO_URI` is set in Vercel Environment Variables
- [ ] `MONGO_URI` is set for **Production** environment
- [ ] Variable name is exactly `MONGO_URI` (case-sensitive)
- [ ] MongoDB connection string is valid
- [ ] Vercel Root Directory is set to `next-app`
- [ ] Latest deployment completed successfully
- [ ] No errors in Vercel Function Logs
- [ ] No errors in browser Console
- [ ] `/api/employee` returns 200 status (not 500 or 404)

## Still Not Working?

1. **Check Vercel Function Logs** - Most detailed error info is here
2. **Test MongoDB connection** - Use MongoDB Compass or `mongosh` to verify
3. **Compare local vs production** - Check if `.env.local` has different values
4. **Redeploy** - Sometimes a fresh deployment fixes issues

## Quick Test Commands

Test health endpoint:
```bash
curl https://your-domain.vercel.app/api/health
```

Test employee API:
```bash
curl https://your-domain.vercel.app/api/employee?page=1&limit=50
```

