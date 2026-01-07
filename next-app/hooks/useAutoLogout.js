'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

/**
 * Custom hook for automatic logout after inactivity
 * 
 * @param {Object} options - Configuration options
 * @param {number} options.inactivityTime - Time in milliseconds before logout (default: 30 minutes)
 * @param {number} options.warningTime - Time in milliseconds before logout to show warning (default: 5 minutes)
 * @param {boolean} options.enabled - Enable/disable auto logout (default: true)
 * @param {Function} options.onWarning - Callback when warning should be shown
 * @param {Function} options.onLogout - Callback when logout is triggered
 */
export function useAutoLogout({
  inactivityTime = 30 * 60 * 1000, // 30 minutes
  warningTime = 5 * 60 * 1000, // 5 minutes before logout
  enabled = true,
  onWarning = null,
  onLogout = null,
} = {}) {
  const router = useRouter();
  const timeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const lastActivityRef = useRef(Date.now());

  const resetTimer = () => {
    if (!enabled) return;

    // Clear existing timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    lastActivityRef.current = Date.now();
    setShowWarning(false);
    setTimeRemaining(null);

    // Set warning timer
    const warningDelay = inactivityTime - warningTime;
    warningTimeoutRef.current = setTimeout(() => {
      setShowWarning(true);
      if (onWarning) {
        onWarning();
      }

      // Start countdown
      countdownIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - lastActivityRef.current;
        const remaining = Math.max(0, inactivityTime - elapsed);
        setTimeRemaining(Math.ceil(remaining / 1000)); // seconds

        if (remaining <= 0) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
        }
      }, 1000);
    }, warningDelay);

    // Set logout timer
    timeoutRef.current = setTimeout(() => {
      handleLogout();
    }, inactivityTime);
  };

  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
    }

    // Clear all timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // Sign out and redirect
    try {
      await signOut({ 
        redirect: false,
        callbackUrl: '/login'
      });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      router.push('/login');
    }
  };

  const handleActivity = () => {
    resetTimer();
  };

  const handleStayLoggedIn = () => {
    resetTimer();
  };

  useEffect(() => {
    if (!enabled) return;

    // Reset timer on mount
    resetTimer();

    // Activity events
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Cleanup
    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [enabled, inactivityTime, warningTime]);

  return {
    showWarning,
    timeRemaining,
    handleStayLoggedIn,
    handleLogout,
  };
}

