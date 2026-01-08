// next-app/app/api/hr/violation-rules/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../lib/db';
import ViolationRules from '../../../../models/ViolationRules';
// Cache removed for simplicity and real-time data

export const dynamic = 'force-dynamic';

// GET /api/hr/violation-rules
// Returns the active violation rules configuration
export async function GET(req) {
  try {
    await connectDB();

    // Get the active rules (should be only one)
    const activeRules = await ViolationRules.findOne({ isActive: true }).lean();

    if (!activeRules) {
      // Return default rules if none exist
      return NextResponse.json({
        rules: {
          violationConfig: {
            freeViolations: 2,
            milestoneInterval: 3,
            perMinuteRate: 0.007,
            maxPerMinuteFine: 1.0,
          },
          absentConfig: {
            bothMissingDays: 1.0,
            partialPunchDays: 1.0,
            leaveWithoutInformDays: 1.5,
          },
          leaveConfig: {
            unpaidLeaveDays: 1.0,
            sickLeaveDays: 1.0,
            halfDayDays: 0.5,
            paidLeaveDays: 0.0,
          },
          salaryConfig: {
            daysPerMonth: 30,
          },
          isActive: true,
          description: 'Default rules',
        },
        message: 'No active rules found, returning defaults',
      });
    }

    return NextResponse.json({ rules: activeRules });
  } catch (err) {
    console.error('GET /api/hr/violation-rules error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/hr/violation-rules
// Creates or updates violation rules (deactivates old active rules)
export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const {
      violationConfig,
      absentConfig,
      leaveConfig,
      salaryConfig,
      description,
      updatedBy,
    } = body;

    // Validate required fields
    if (!violationConfig || !absentConfig || !leaveConfig || !salaryConfig) {
      return NextResponse.json(
        { error: 'All configuration sections are required' },
        { status: 400 }
      );
    }

    // Deactivate all existing active rules
    await ViolationRules.updateMany(
      { isActive: true },
      { isActive: false }
    );

    // Create new active rules
    const newRules = await ViolationRules.create({
      violationConfig: {
        freeViolations: violationConfig.freeViolations ?? 2,
        milestoneInterval: violationConfig.milestoneInterval ?? 3,
        perMinuteRate: violationConfig.perMinuteRate ?? 0.007,
        maxPerMinuteFine: violationConfig.maxPerMinuteFine ?? 1.0,
      },
      absentConfig: {
        bothMissingDays: absentConfig.bothMissingDays ?? 1.0,
        partialPunchDays: absentConfig.partialPunchDays ?? 1.0,
        leaveWithoutInformDays: absentConfig.leaveWithoutInformDays ?? 1.5,
      },
      leaveConfig: {
        unpaidLeaveDays: leaveConfig.unpaidLeaveDays ?? 1.0,
        sickLeaveDays: leaveConfig.sickLeaveDays ?? 1.0,
        halfDayDays: leaveConfig.halfDayDays ?? 0.5,
        paidLeaveDays: leaveConfig.paidLeaveDays ?? 0.0,
      },
      salaryConfig: {
        daysPerMonth: salaryConfig.daysPerMonth ?? 30,
      },
      isActive: true,
      description: description || 'Violation and salary deduction rules',
      updatedBy: updatedBy || 'HR',
    });

    // Cache removed - data is always fresh

    return NextResponse.json({
      success: true,
      rules: newRules,
      message: 'Violation rules updated successfully',
    });
  } catch (err) {
    console.error('POST /api/hr/violation-rules error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/hr/violation-rules
// Updates the active violation rules
export async function PUT(req) {
  try {
    await connectDB();

    const body = await req.json();
    const {
      violationConfig,
      absentConfig,
      leaveConfig,
      salaryConfig,
      description,
      updatedBy,
    } = body;

    // Find active rules
    const activeRules = await ViolationRules.findOne({ isActive: true });

    if (!activeRules) {
      // If no active rules exist, create new ones using the same logic as POST
      // (Cannot call POST(req) because body has already been read)
      if (!violationConfig || !absentConfig || !leaveConfig || !salaryConfig) {
        return NextResponse.json(
          { error: 'All configuration sections are required' },
          { status: 400 }
        );
      }

      // Deactivate all existing active rules
      await ViolationRules.updateMany(
        { isActive: true },
        { isActive: false }
      );

      // Create new active rules
      const newRules = await ViolationRules.create({
        violationConfig: {
          freeViolations: violationConfig.freeViolations ?? 2,
          milestoneInterval: violationConfig.milestoneInterval ?? 3,
          perMinuteRate: violationConfig.perMinuteRate ?? 0.007,
          maxPerMinuteFine: violationConfig.maxPerMinuteFine ?? 1.0,
        },
        absentConfig: {
          bothMissingDays: absentConfig.bothMissingDays ?? 1.0,
          partialPunchDays: absentConfig.partialPunchDays ?? 1.0,
          leaveWithoutInformDays: absentConfig.leaveWithoutInformDays ?? 1.5,
        },
        leaveConfig: {
          unpaidLeaveDays: leaveConfig.unpaidLeaveDays ?? 1.0,
          sickLeaveDays: leaveConfig.sickLeaveDays ?? 1.0,
          halfDayDays: leaveConfig.halfDayDays ?? 0.5,
          paidLeaveDays: leaveConfig.paidLeaveDays ?? 0.0,
        },
        salaryConfig: {
          daysPerMonth: salaryConfig.daysPerMonth ?? 30,
        },
        isActive: true,
        description: description || 'Violation and salary deduction rules',
        updatedBy: updatedBy || 'HR',
      });

      // Invalidate cache for violation rules and monthly attendance (which uses these rules)
      invalidateCache('active-violation-rules');
      invalidateCache('monthly-attendance');

      return NextResponse.json({
        success: true,
        rules: newRules,
        message: 'Violation rules created successfully',
      });
    }

    // Update active rules
    if (violationConfig) {
      activeRules.violationConfig = {
        freeViolations: violationConfig.freeViolations ?? activeRules.violationConfig.freeViolations,
        milestoneInterval: violationConfig.milestoneInterval ?? activeRules.violationConfig.milestoneInterval,
        perMinuteRate: violationConfig.perMinuteRate ?? activeRules.violationConfig.perMinuteRate,
        maxPerMinuteFine: violationConfig.maxPerMinuteFine ?? activeRules.violationConfig.maxPerMinuteFine,
      };
    }

    if (absentConfig) {
      activeRules.absentConfig = {
        bothMissingDays: absentConfig.bothMissingDays ?? activeRules.absentConfig.bothMissingDays,
        partialPunchDays: absentConfig.partialPunchDays ?? activeRules.absentConfig.partialPunchDays,
        leaveWithoutInformDays: absentConfig.leaveWithoutInformDays ?? activeRules.absentConfig.leaveWithoutInformDays,
      };
    }

    if (leaveConfig) {
      activeRules.leaveConfig = {
        unpaidLeaveDays: leaveConfig.unpaidLeaveDays ?? activeRules.leaveConfig.unpaidLeaveDays,
        sickLeaveDays: leaveConfig.sickLeaveDays ?? activeRules.leaveConfig.sickLeaveDays,
        halfDayDays: leaveConfig.halfDayDays ?? activeRules.leaveConfig.halfDayDays,
        paidLeaveDays: leaveConfig.paidLeaveDays ?? activeRules.leaveConfig.paidLeaveDays,
      };
    }

    if (salaryConfig) {
      activeRules.salaryConfig = {
        daysPerMonth: salaryConfig.daysPerMonth ?? activeRules.salaryConfig.daysPerMonth,
      };
    }

    if (description !== undefined) {
      activeRules.description = description;
    }

    if (updatedBy) {
      activeRules.updatedBy = updatedBy;
    }

    await activeRules.save();

    // Cache removed - data is always fresh

    return NextResponse.json({
      success: true,
      rules: activeRules,
      message: 'Violation rules updated successfully',
    });
  } catch (err) {
    console.error('PUT /api/hr/violation-rules error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

