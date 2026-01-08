# Deployment Verification Guide

## Issue: Live site showing old code (shift filter still visible)

If your live site is still showing the shift filter after pushing the latest code, follow these steps:

### Step 1: Verify Code is Pushed
```bash
cd next-app
git log --oneline -1
# Should show: "Remove shift filter from employee manage page..."
```

### Step 2: Check Vercel Deployment Status

1. Go to your Vercel Dashboard: https://vercel.com/dashboard
2. Select your project
3. Go to the **Deployments** tab
4. Check the latest deployment:
   - Status should be **"Ready"** (green checkmark)
   - Commit should match your latest commit (ba90691)
   - If it shows "Building" or "Error", wait for it to complete

### Step 3: Force Redeploy (if needed)

If the latest commit isn't deployed:
1. In Vercel Dashboard → Deployments
2. Click the **"..."** menu on the latest deployment
3. Select **"Redeploy"**
4. Wait for deployment to complete (usually 2-3 minutes)

### Step 4: Clear Browser Cache

The browser might be caching the old JavaScript:

**Chrome/Edge:**
1. Press `Ctrl + Shift + Delete` (Windows) or `Cmd + Shift + Delete` (Mac)
2. Select "Cached images and files"
3. Click "Clear data"
4. Or do a hard refresh: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)

**Firefox:**
1. Press `Ctrl + Shift + Delete`
2. Select "Cache"
3. Click "Clear Now"
4. Or hard refresh: `Ctrl + F5`

### Step 5: Verify the Fix

After clearing cache and redeploying:
1. Visit: `https://ams.globaldigitsolutions.com/hr/employees/manage`
2. You should see:
   - ✅ Only a search bar (no shift filter dropdown)
   - ✅ All employees showing by default
   - ✅ No "No employees found" message

### Step 6: Check API Response

Open browser DevTools (F12) → Network tab:
1. Filter by "employee"
2. Click on the `/api/employee` request
3. Check the **Response** tab
4. Should see `items` array with employees
5. Should NOT see `shift` parameter in the request URL

### Step 7: Check Vercel Function Logs

If employees still don't show:
1. Go to Vercel Dashboard → Your Project → Functions
2. Click on `/api/employee`
3. Check the **Logs** tab
4. Look for:
   - `[Employee API] 🔍 Total employees in database (no filter): X`
   - `[Employee API] Employees found: X`
   - Any error messages

### Common Issues

**Issue:** Shift filter still showing
- **Solution:** Clear browser cache and hard refresh

**Issue:** "No employees found" message
- **Solution:** Check Vercel Function Logs to see if employees exist in database
- Check if API is returning data: `https://ams.globaldigitsolutions.com/api/employee?page=1&limit=50`

**Issue:** Deployment stuck on "Building"
- **Solution:** Check Vercel build logs for errors
- Verify `MONGO_URI` environment variable is set in Vercel

### Quick Test URLs

Test these URLs directly in your browser:

1. **Health Check:**
   ```
   https://ams.globaldigitsolutions.com/api/health
   ```
   Should return: `{"status":"healthy","database":"connected",...}`

2. **Employee Test (No Filters):**
   ```
   https://ams.globaldigitsolutions.com/api/employee/test
   ```
   Should return: `{"success":true,"total":X,"count":X,...}`

3. **Employee API (All Employees):**
   ```
   https://ams.globaldigitsolutions.com/api/employee?page=1&limit=50
   ```
   Should return: `{"items":[...],"pagination":{...}}`

If these URLs work but the page doesn't show data, it's a frontend caching issue.

