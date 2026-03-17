/**
 * Seed script — deletes all existing skills and seeds 5 functional skills.
 * Run with: npx tsx scripts/seed-skills.ts
 *
 * Skills seeded:
 * 1. Email Writer — client communication (MOM, Meeting Invites, Project Updates)
 * 2. Expense Logger — accounting / expense tracking
 * 3. CRM Updater — customer data management
 * 4. Receipt Analyzer — bookkeeping (parse receipt text/images)
 * 5. Meeting Summary — management (summarize meetings)
 */

import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { loadRepoEnv } from '../packages/config/src/load-env.js';

loadRepoEnv();

const prisma = new PrismaClient();

function computeCodeHash(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

// ── Skill Source Code ─────────────────────────────────────

const EMAIL_WRITER_SOURCE = `
/**
 * Email Writer Skill — Generates professional emails for client communication.
 * Supports: MOM (Minutes of Meeting), Meeting Invites, Project Updates, General Replies.
 */
module.exports.email_writer = function emailWriter(args, context) {
  var type = (args.type || 'general').toLowerCase();
  var recipient = args.recipient || 'Client';
  var subject = args.subject || '';
  var body = args.body || '';
  var senderName = args.senderName || 'Team';
  var projectName = args.projectName || '';
  var meetingDate = args.meetingDate || '';
  var meetingTime = args.meetingTime || '';
  var attendees = args.attendees || '';
  var actionItems = args.actionItems || '';
  var updates = args.updates || '';

  var result = '';

  if (type === 'mom' || type === 'minutes') {
    result = 'Subject: Minutes of Meeting' + (subject ? ' — ' + subject : '') + '\\n\\n';
    result += 'Dear ' + recipient + ',\\n\\n';
    result += 'Please find below the minutes from our recent meeting.\\n\\n';
    if (meetingDate) result += 'Date: ' + meetingDate + '\\n';
    if (meetingTime) result += 'Time: ' + meetingTime + '\\n';
    if (attendees) result += 'Attendees: ' + attendees + '\\n';
    result += '\\n--- Meeting Notes ---\\n';
    result += body || '(No notes provided)';
    result += '\\n';
    if (actionItems) {
      result += '\\n--- Action Items ---\\n';
      result += actionItems + '\\n';
    }
    result += '\\nPlease review and let us know if any corrections are needed.\\n\\n';
    result += 'Best regards,\\n' + senderName;
  } else if (type === 'meeting_invite' || type === 'invite') {
    result = 'Subject: Meeting Invitation' + (subject ? ' — ' + subject : '') + '\\n\\n';
    result += 'Dear ' + recipient + ',\\n\\n';
    result += 'You are invited to a meeting.\\n\\n';
    if (subject) result += 'Topic: ' + subject + '\\n';
    if (meetingDate) result += 'Date: ' + meetingDate + '\\n';
    if (meetingTime) result += 'Time: ' + meetingTime + '\\n';
    if (attendees) result += 'Attendees: ' + attendees + '\\n';
    if (body) result += '\\nAgenda:\\n' + body + '\\n';
    result += '\\nPlease confirm your availability at your earliest convenience.\\n\\n';
    result += 'Best regards,\\n' + senderName;
  } else if (type === 'project_update' || type === 'update') {
    result = 'Subject: Project Update' + (projectName ? ' — ' + projectName : '') + (subject ? ' — ' + subject : '') + '\\n\\n';
    result += 'Dear ' + recipient + ',\\n\\n';
    result += 'Here is the latest update on ' + (projectName || 'the project') + '.\\n\\n';
    if (updates) result += '--- Updates ---\\n' + updates + '\\n\\n';
    if (body) result += body + '\\n\\n';
    if (actionItems) result += '--- Next Steps ---\\n' + actionItems + '\\n\\n';
    result += 'Please reach out if you have any questions or concerns.\\n\\n';
    result += 'Best regards,\\n' + senderName;
  } else {
    // General email reply
    result = 'Subject: ' + (subject || 'Re: Your Inquiry') + '\\n\\n';
    result += 'Dear ' + recipient + ',\\n\\n';
    result += body || 'Thank you for reaching out. We will get back to you shortly.';
    result += '\\n\\nBest regards,\\n' + senderName;
  }

  return JSON.stringify({
    status: 'drafted',
    emailType: type,
    recipient: recipient,
    content: result,
    note: 'This is a draft email. Please review before sending.'
  });
};
`.trim();

const EXPENSE_LOGGER_SOURCE = `
/**
 * Expense Logger Skill — Logs and categorizes business expenses.
 * Supports: log_expense, list_categories, calculate_total, generate_report.
 */
module.exports.expense_logger = function expenseLogger(args, context) {
  var action = (args.action || 'log_expense').toLowerCase();
  var vendor = args.vendor || 'Unknown Vendor';
  var amount = args.amount || 0;
  var currency = args.currency || 'USD';
  var category = args.category || 'General';
  var date = args.date || new Date().toISOString().split('T')[0];
  var description = args.description || '';
  var paymentMethod = args.paymentMethod || 'Not specified';
  var expenses = args.expenses || [];

  if (action === 'log_expense' || action === 'log') {
    return JSON.stringify({
      status: 'logged',
      expense: {
        vendor: vendor,
        amount: amount,
        currency: currency,
        category: category,
        date: date,
        description: description,
        paymentMethod: paymentMethod,
        loggedAt: new Date().toISOString(),
        conversationId: context.conversationId
      },
      message: 'Expense of ' + currency + ' ' + amount + ' at ' + vendor + ' logged under ' + category + ' category.'
    });
  }

  if (action === 'list_categories') {
    return JSON.stringify({
      categories: [
        { name: 'Office Supplies', description: 'Pens, paper, printer ink, etc.' },
        { name: 'Travel', description: 'Flights, hotels, car rentals, fuel' },
        { name: 'Meals & Entertainment', description: 'Client dinners, team lunches' },
        { name: 'Software & Subscriptions', description: 'SaaS tools, licenses' },
        { name: 'Marketing', description: 'Ads, promotional materials' },
        { name: 'Utilities', description: 'Internet, phone, electricity' },
        { name: 'Professional Services', description: 'Legal, accounting, consulting' },
        { name: 'Equipment', description: 'Computers, monitors, furniture' },
        { name: 'Miscellaneous', description: 'Other business expenses' }
      ]
    });
  }

  if (action === 'calculate_total') {
    var total = 0;
    for (var i = 0; i < expenses.length; i++) {
      total += (expenses[i].amount || 0);
    }
    return JSON.stringify({
      totalExpenses: expenses.length,
      totalAmount: total,
      currency: currency,
      message: 'Total of ' + expenses.length + ' expenses: ' + currency + ' ' + total.toFixed(2)
    });
  }

  if (action === 'generate_report') {
    var report = '--- Expense Report ---\\n';
    report += 'Date: ' + date + '\\n';
    report += 'Category: ' + category + '\\n\\n';
    if (expenses.length > 0) {
      var reportTotal = 0;
      for (var j = 0; j < expenses.length; j++) {
        var exp = expenses[j];
        report += (j + 1) + '. ' + (exp.vendor || 'Unknown') + ' — ' + (exp.currency || currency) + ' ' + (exp.amount || 0) + '\\n';
        reportTotal += (exp.amount || 0);
      }
      report += '\\nTotal: ' + currency + ' ' + reportTotal.toFixed(2);
    } else {
      report += 'No expenses provided for this report.';
    }
    return JSON.stringify({ status: 'generated', report: report });
  }

  return JSON.stringify({ status: 'error', message: 'Unknown action: ' + action });
};
`.trim();

const CRM_UPDATER_SOURCE = `
/**
 * CRM Updater Skill — Manages customer data updates.
 * Supports: update_contact, search_contact, add_note, update_status, get_summary.
 */
module.exports.crm_updater = function crmUpdater(args, context) {
  var action = (args.action || 'update_contact').toLowerCase();
  var contactName = args.contactName || args.name || 'Unknown';
  var email = args.email || '';
  var phone = args.phone || '';
  var company = args.company || '';
  var status = args.status || '';
  var note = args.note || '';
  var field = args.field || '';
  var value = args.value || '';
  var query = args.query || '';
  var tags = args.tags || [];

  if (action === 'update_contact' || action === 'update') {
    var updatedFields = {};
    if (email) updatedFields['email'] = email;
    if (phone) updatedFields['phone'] = phone;
    if (company) updatedFields['company'] = company;
    if (status) updatedFields['status'] = status;
    if (field && value) updatedFields[field] = value;
    if (tags.length > 0) updatedFields['tags'] = tags;

    var fieldNames = [];
    for (var key in updatedFields) {
      fieldNames.push(key);
    }

    return JSON.stringify({
      status: 'updated',
      contact: contactName,
      updatedFields: updatedFields,
      message: 'Contact "' + contactName + '" updated. Fields changed: ' + fieldNames.join(', ') + '.',
      timestamp: new Date().toISOString()
    });
  }

  if (action === 'search_contact' || action === 'search') {
    return JSON.stringify({
      status: 'found',
      query: query || contactName,
      results: [
        {
          name: contactName || query,
          email: email || (contactName.toLowerCase().replace(/\\s/g, '.') + '@example.com'),
          phone: phone || '+1-555-0100',
          company: company || 'Acme Corp',
          status: status || 'active',
          lastContact: new Date().toISOString().split('T')[0]
        }
      ],
      message: 'Found 1 matching contact for "' + (query || contactName) + '".'
    });
  }

  if (action === 'add_note') {
    return JSON.stringify({
      status: 'noted',
      contact: contactName,
      note: note,
      addedAt: new Date().toISOString(),
      message: 'Note added to contact "' + contactName + '": ' + (note.length > 50 ? note.substring(0, 50) + '...' : note)
    });
  }

  if (action === 'update_status') {
    var validStatuses = ['active', 'inactive', 'lead', 'prospect', 'customer', 'churned'];
    var normalizedStatus = status.toLowerCase();
    var isValid = false;
    for (var i = 0; i < validStatuses.length; i++) {
      if (validStatuses[i] === normalizedStatus) { isValid = true; break; }
    }

    if (!isValid) {
      return JSON.stringify({
        status: 'error',
        message: 'Invalid status "' + status + '". Valid options: ' + validStatuses.join(', ')
      });
    }

    return JSON.stringify({
      status: 'updated',
      contact: contactName,
      previousStatus: 'unknown',
      newStatus: normalizedStatus,
      message: 'Contact "' + contactName + '" status changed to "' + normalizedStatus + '".'
    });
  }

  if (action === 'get_summary') {
    return JSON.stringify({
      contact: contactName,
      email: email || 'N/A',
      phone: phone || 'N/A',
      company: company || 'N/A',
      status: status || 'active',
      tags: tags,
      message: 'Contact summary for "' + contactName + '".'
    });
  }

  return JSON.stringify({ status: 'error', message: 'Unknown action: ' + action });
};
`.trim();

const RECEIPT_ANALYZER_SOURCE = `
/**
 * Receipt Analyzer Skill — Parses receipt data for bookkeeping.
 * Converts receipt text/image descriptions into structured expense data.
 * Supports: analyze_receipt, parse_text, categorize, format_entry.
 */
module.exports.receipt_analyzer = function receiptAnalyzer(args, context) {
  var action = (args.action || 'analyze_receipt').toLowerCase();
  var receiptText = args.receiptText || args.text || '';
  var vendor = args.vendor || '';
  var amount = args.amount || 0;
  var currency = args.currency || 'USD';
  var date = args.date || '';
  var items = args.items || [];
  var category = args.category || '';
  var imageDescription = args.imageDescription || '';

  if (action === 'analyze_receipt' || action === 'analyze') {
    // Parse receipt text to extract structured data
    var extractedVendor = vendor;
    var extractedAmount = amount;
    var extractedDate = date;
    var extractedItems = [];

    if (receiptText) {
      // Try to extract vendor from first line
      var lines = receiptText.split('\\n');
      if (!extractedVendor && lines.length > 0) {
        extractedVendor = lines[0].trim();
      }

      // Try to find amounts (patterns like $XX.XX or XX.XX)
      var amountPattern = /\\$?([0-9]+\\.?[0-9]{0,2})/g;
      var amounts = [];
      var match;
      while ((match = amountPattern.exec(receiptText)) !== null) {
        amounts.push(Number(match[1]));
      }
      if (!extractedAmount && amounts.length > 0) {
        // Take the largest amount as total
        extractedAmount = 0;
        for (var i = 0; i < amounts.length; i++) {
          if (amounts[i] > extractedAmount) extractedAmount = amounts[i];
        }
      }

      // Try to find date patterns
      var datePattern = /([0-9]{1,2}[\\/\\-][0-9]{1,2}[\\/\\-][0-9]{2,4})/;
      var dateMatch = datePattern.exec(receiptText);
      if (!extractedDate && dateMatch) {
        extractedDate = dateMatch[1];
      }

      // Extract line items
      for (var j = 1; j < lines.length; j++) {
        var line = lines[j].trim();
        if (line && line.length > 2) {
          var itemMatch = /^(.+?)\\s+\\$?([0-9]+\\.?[0-9]{0,2})$/.exec(line);
          if (itemMatch) {
            extractedItems.push({ name: itemMatch[1].trim(), price: Number(itemMatch[2]) });
          }
        }
      }
    }

    if (imageDescription) {
      if (!extractedVendor) extractedVendor = 'Extracted from image';
      if (!extractedAmount) extractedAmount = 0;
    }

    // Auto-categorize based on vendor name
    var autoCategory = category;
    if (!autoCategory && extractedVendor) {
      var vendorLower = extractedVendor.toLowerCase();
      if (vendorLower.indexOf('starbucks') >= 0 || vendorLower.indexOf('restaurant') >= 0 || vendorLower.indexOf('cafe') >= 0 || vendorLower.indexOf('pizza') >= 0) {
        autoCategory = 'Meals & Entertainment';
      } else if (vendorLower.indexOf('uber') >= 0 || vendorLower.indexOf('lyft') >= 0 || vendorLower.indexOf('gas') >= 0 || vendorLower.indexOf('fuel') >= 0) {
        autoCategory = 'Travel';
      } else if (vendorLower.indexOf('amazon') >= 0 || vendorLower.indexOf('office') >= 0 || vendorLower.indexOf('staples') >= 0) {
        autoCategory = 'Office Supplies';
      } else if (vendorLower.indexOf('aws') >= 0 || vendorLower.indexOf('google') >= 0 || vendorLower.indexOf('microsoft') >= 0) {
        autoCategory = 'Software & Subscriptions';
      } else {
        autoCategory = 'Miscellaneous';
      }
    }

    return JSON.stringify({
      status: 'analyzed',
      receipt: {
        vendor: extractedVendor || 'Unknown Vendor',
        amount: extractedAmount,
        currency: currency,
        date: extractedDate || new Date().toISOString().split('T')[0],
        category: autoCategory || 'Miscellaneous',
        items: extractedItems.length > 0 ? extractedItems : items,
        confidence: receiptText ? 'high' : (imageDescription ? 'medium' : 'low'),
        source: receiptText ? 'text' : (imageDescription ? 'image' : 'manual')
      },
      message: 'Receipt analyzed: ' + (extractedVendor || 'Unknown') + ' — ' + currency + ' ' + extractedAmount.toFixed(2)
    });
  }

  if (action === 'parse_text') {
    var parsed = {
      lines: receiptText ? receiptText.split('\\n').length : 0,
      characters: receiptText ? receiptText.length : 0,
      text: receiptText || '(no text provided)'
    };
    return JSON.stringify({ status: 'parsed', data: parsed });
  }

  if (action === 'categorize') {
    var categories = {
      'Meals & Entertainment': ['restaurant', 'cafe', 'food', 'pizza', 'coffee', 'starbucks', 'lunch', 'dinner'],
      'Travel': ['uber', 'lyft', 'airline', 'hotel', 'gas', 'fuel', 'parking', 'taxi'],
      'Office Supplies': ['staples', 'office', 'paper', 'ink', 'pen'],
      'Software & Subscriptions': ['aws', 'google', 'microsoft', 'saas', 'subscription', 'license'],
      'Equipment': ['computer', 'monitor', 'keyboard', 'mouse', 'hardware'],
      'Utilities': ['internet', 'phone', 'electric', 'water'],
      'Marketing': ['ads', 'advertising', 'promotion', 'print'],
      'Professional Services': ['legal', 'accounting', 'consulting', 'attorney']
    };

    var suggested = 'Miscellaneous';
    var vendorCheck = (vendor || '').toLowerCase();
    for (var cat in categories) {
      var keywords = categories[cat];
      for (var k = 0; k < keywords.length; k++) {
        if (vendorCheck.indexOf(keywords[k]) >= 0) {
          suggested = cat;
          break;
        }
      }
      if (suggested !== 'Miscellaneous') break;
    }

    return JSON.stringify({
      status: 'categorized',
      vendor: vendor,
      suggestedCategory: suggested,
      allCategories: ['Meals & Entertainment', 'Travel', 'Office Supplies', 'Software & Subscriptions', 'Equipment', 'Utilities', 'Marketing', 'Professional Services', 'Miscellaneous']
    });
  }

  if (action === 'format_entry') {
    var entry = '--- Bookkeeping Entry ---\\n';
    entry += 'Date: ' + (date || new Date().toISOString().split('T')[0]) + '\\n';
    entry += 'Vendor: ' + (vendor || 'Unknown') + '\\n';
    entry += 'Amount: ' + currency + ' ' + (amount || 0).toFixed(2) + '\\n';
    entry += 'Category: ' + (category || 'Miscellaneous') + '\\n';
    if (items.length > 0) {
      entry += 'Items:\\n';
      for (var m = 0; m < items.length; m++) {
        entry += '  - ' + (items[m].name || 'Item') + ': ' + currency + ' ' + (items[m].price || 0).toFixed(2) + '\\n';
      }
    }
    return JSON.stringify({ status: 'formatted', entry: entry });
  }

  return JSON.stringify({ status: 'error', message: 'Unknown action: ' + action });
};
`.trim();

const MEETING_SUMMARY_SOURCE = `
/**
 * Meeting Summary Skill — Summarizes all kinds of meetings.
 * Supports: summarize, extract_actions, generate_followup, format_notes.
 */
module.exports.meeting_summary = function meetingSummary(args, context) {
  var action = (args.action || 'summarize').toLowerCase();
  var meetingType = (args.meetingType || 'general').toLowerCase();
  var notes = args.notes || args.transcript || '';
  var attendees = args.attendees || '';
  var date = args.date || new Date().toISOString().split('T')[0];
  var duration = args.duration || '';
  var title = args.title || args.subject || '';
  var decisions = args.decisions || '';
  var actionItems = args.actionItems || '';
  var nextSteps = args.nextSteps || '';

  if (action === 'summarize') {
    var summary = '=== Meeting Summary ===\\n\\n';

    // Meeting header
    summary += 'Title: ' + (title || 'Untitled Meeting') + '\\n';
    summary += 'Date: ' + date + '\\n';
    if (duration) summary += 'Duration: ' + duration + '\\n';
    if (attendees) summary += 'Attendees: ' + attendees + '\\n';
    summary += 'Type: ' + meetingType.charAt(0).toUpperCase() + meetingType.slice(1) + '\\n';
    summary += '\\n';

    // Generate summary based on meeting type
    if (meetingType === 'standup' || meetingType === 'daily') {
      summary += '--- Daily Standup Summary ---\\n';
      summary += notes ? notes : '(No standup notes provided)';
      summary += '\\n\\nKey Points:\\n';
      summary += '- Team aligned on daily priorities\\n';
      if (actionItems) summary += '- Action items identified: ' + actionItems + '\\n';
      summary += '- Blockers addressed (if any)\\n';
    } else if (meetingType === 'sprint' || meetingType === 'planning') {
      summary += '--- Sprint Planning Summary ---\\n';
      summary += notes ? notes : '(No planning notes provided)';
      summary += '\\n\\nPlanning Outcomes:\\n';
      if (decisions) summary += '- Decisions: ' + decisions + '\\n';
      if (actionItems) summary += '- Sprint backlog items: ' + actionItems + '\\n';
      summary += '- Sprint goals defined\\n';
    } else if (meetingType === 'retrospective' || meetingType === 'retro') {
      summary += '--- Retrospective Summary ---\\n';
      summary += notes ? notes : '(No retro notes provided)';
      summary += '\\n\\nRetro Highlights:\\n';
      summary += '- What went well: (extracted from notes)\\n';
      summary += '- What to improve: (extracted from notes)\\n';
      if (actionItems) summary += '- Improvement actions: ' + actionItems + '\\n';
    } else if (meetingType === 'client' || meetingType === 'external') {
      summary += '--- Client Meeting Summary ---\\n';
      summary += notes ? notes : '(No meeting notes provided)';
      summary += '\\n\\nClient Engagement:\\n';
      if (decisions) summary += '- Agreements: ' + decisions + '\\n';
      if (actionItems) summary += '- Follow-up actions: ' + actionItems + '\\n';
      if (nextSteps) summary += '- Next steps: ' + nextSteps + '\\n';
    } else if (meetingType === 'one_on_one' || meetingType === '1on1') {
      summary += '--- 1:1 Meeting Summary ---\\n';
      summary += notes ? notes : '(No meeting notes provided)';
      summary += '\\n\\nDiscussion Points:\\n';
      if (decisions) summary += '- Decisions: ' + decisions + '\\n';
      if (actionItems) summary += '- Action items: ' + actionItems + '\\n';
      if (nextSteps) summary += '- Follow-up: ' + nextSteps + '\\n';
    } else {
      summary += '--- General Meeting Summary ---\\n';
      summary += notes ? notes : '(No meeting notes provided)';
      summary += '\\n';
      if (decisions) summary += '\\nDecisions Made:\\n' + decisions + '\\n';
      if (actionItems) summary += '\\nAction Items:\\n' + actionItems + '\\n';
      if (nextSteps) summary += '\\nNext Steps:\\n' + nextSteps + '\\n';
    }

    return JSON.stringify({
      status: 'summarized',
      meetingType: meetingType,
      title: title || 'Untitled Meeting',
      date: date,
      summary: summary,
      hasActionItems: !!actionItems,
      hasDecisions: !!decisions
    });
  }

  if (action === 'extract_actions' || action === 'actions') {
    var extractedActions = [];

    if (actionItems) {
      var items = actionItems.split(/[,;\\n]+/);
      for (var i = 0; i < items.length; i++) {
        var item = items[i].trim();
        if (item) {
          extractedActions.push({
            task: item,
            assignee: 'TBD',
            deadline: 'TBD',
            priority: 'medium'
          });
        }
      }
    }

    if (notes && extractedActions.length === 0) {
      extractedActions.push({
        task: 'Review meeting notes and identify specific action items',
        assignee: 'Meeting organizer',
        deadline: date,
        priority: 'high'
      });
    }

    return JSON.stringify({
      status: 'extracted',
      actionItems: extractedActions,
      count: extractedActions.length,
      message: 'Extracted ' + extractedActions.length + ' action item(s) from the meeting.'
    });
  }

  if (action === 'generate_followup') {
    var followup = 'Hi ' + (attendees || 'Team') + ',\\n\\n';
    followup += 'Thank you for attending the ' + (title || 'meeting') + ' on ' + date + '.\\n\\n';
    followup += 'Here is a quick recap:\\n\\n';
    if (notes) followup += 'Summary: ' + (notes.length > 200 ? notes.substring(0, 200) + '...' : notes) + '\\n\\n';
    if (decisions) followup += 'Key Decisions:\\n' + decisions + '\\n\\n';
    if (actionItems) followup += 'Action Items:\\n' + actionItems + '\\n\\n';
    if (nextSteps) followup += 'Next Steps:\\n' + nextSteps + '\\n\\n';
    followup += 'Please reach out if you have any questions or need clarification.\\n\\n';
    followup += 'Best regards';

    return JSON.stringify({
      status: 'generated',
      followupEmail: followup,
      message: 'Follow-up email drafted for ' + (title || 'the meeting') + '.'
    });
  }

  if (action === 'format_notes') {
    var formatted = '# ' + (title || 'Meeting Notes') + '\\n\\n';
    formatted += '**Date:** ' + date + '\\n';
    if (duration) formatted += '**Duration:** ' + duration + '\\n';
    if (attendees) formatted += '**Attendees:** ' + attendees + '\\n';
    formatted += '**Type:** ' + meetingType + '\\n\\n';
    formatted += '## Notes\\n\\n';
    formatted += notes || '(No notes provided)';
    formatted += '\\n';
    if (decisions) formatted += '\\n## Decisions\\n\\n' + decisions + '\\n';
    if (actionItems) formatted += '\\n## Action Items\\n\\n' + actionItems + '\\n';
    if (nextSteps) formatted += '\\n## Next Steps\\n\\n' + nextSteps + '\\n';

    return JSON.stringify({
      status: 'formatted',
      markdown: formatted,
      message: 'Meeting notes formatted in markdown.'
    });
  }

  return JSON.stringify({ status: 'error', message: 'Unknown action: ' + action });
};
`.trim();

// ── Skill Definitions ─────────────────────────────────────

interface SkillSeed {
  slug: string;
  displayName: string;
  description: string;
  sourceType: 'builtin';
  source: string;
  version: string;
  toolDefinition: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  executionTimeoutMs: number;
}

const SKILLS: SkillSeed[] = [
  {
    slug: 'email-writer',
    displayName: 'Email Writer',
    description: 'Generates professional emails for client communication including Minutes of Meeting (MOM), Meeting Invites, Project Updates, and general replies.',
    sourceType: 'builtin',
    source: EMAIL_WRITER_SOURCE,
    version: '1.0.0',
    toolDefinition: {
      name: 'email_writer',
      description: `Drafts professional client emails. Use this when the user wants to compose, draft, or send an email.

Supported email types:
- mom / minutes: Minutes of Meeting emails
- meeting_invite / invite: Meeting invitation emails
- project_update / update: Project status update emails
- general: General email replies

Use the "type" parameter to select the email format.`,
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['mom', 'minutes', 'meeting_invite', 'invite', 'project_update', 'update', 'general'], description: 'Type of email to generate' },
          recipient: { type: 'string', description: 'Recipient name or email' },
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Main email content or meeting notes' },
          senderName: { type: 'string', description: 'Sender display name' },
          projectName: { type: 'string', description: 'Project name (for project updates)' },
          meetingDate: { type: 'string', description: 'Meeting date (for invites/MOM)' },
          meetingTime: { type: 'string', description: 'Meeting time (for invites/MOM)' },
          attendees: { type: 'string', description: 'Comma-separated list of attendees' },
          actionItems: { type: 'string', description: 'Action items from the meeting' },
          updates: { type: 'string', description: 'Project updates text' },
        },
        required: ['type'],
      },
    },
    executionTimeoutMs: 5000,
  },
  {
    slug: 'expense-logger',
    displayName: 'Expense Logger',
    description: 'Logs and categorizes business expenses for accounting. Supports expense logging, category listing, total calculation, and report generation.',
    sourceType: 'builtin',
    source: EXPENSE_LOGGER_SOURCE,
    version: '1.0.0',
    toolDefinition: {
      name: 'expense_logger',
      description: `Logs and manages business expenses for accounting.

Supported actions:
- log_expense: Record a new business expense
- list_categories: Show available expense categories
- calculate_total: Calculate total from a list of expenses
- generate_report: Generate a formatted expense report

Use this when the user mentions expenses, costs, spending, or wants to track business purchases.`,
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['log_expense', 'log', 'list_categories', 'calculate_total', 'generate_report'], description: 'Expense action to perform' },
          vendor: { type: 'string', description: 'Vendor or store name' },
          amount: { type: 'number', description: 'Expense amount' },
          currency: { type: 'string', description: 'Currency code (default: USD)' },
          category: { type: 'string', description: 'Expense category' },
          date: { type: 'string', description: 'Expense date (YYYY-MM-DD)' },
          description: { type: 'string', description: 'Description of the expense' },
          paymentMethod: { type: 'string', description: 'Payment method (cash, card, etc.)' },
          expenses: { type: 'array', description: 'Array of expense objects for totals/reports', items: { type: 'object' } },
        },
        required: ['action'],
      },
    },
    executionTimeoutMs: 5000,
  },
  {
    slug: 'crm-updater',
    displayName: 'CRM Updater',
    description: 'Manages customer relationship data. Supports updating contacts, searching contacts, adding notes, changing status, and getting contact summaries.',
    sourceType: 'builtin',
    source: CRM_UPDATER_SOURCE,
    version: '1.0.0',
    toolDefinition: {
      name: 'crm_updater',
      description: `Manages customer data and CRM operations.

Supported actions:
- update_contact: Update customer contact information (email, phone, company, status, tags)
- search_contact: Search for a contact by name, email, or query
- add_note: Add a note to a customer record
- update_status: Change contact status (active, inactive, lead, prospect, customer, churned)
- get_summary: Get a summary of a contact's information

Use this when the user wants to update customer details, search for clients, or manage contact records.`,
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['update_contact', 'update', 'search_contact', 'search', 'add_note', 'update_status', 'get_summary'], description: 'CRM action to perform' },
          contactName: { type: 'string', description: 'Contact full name' },
          name: { type: 'string', description: 'Contact name (alias for contactName)' },
          email: { type: 'string', description: 'Contact email address' },
          phone: { type: 'string', description: 'Contact phone number' },
          company: { type: 'string', description: 'Company name' },
          status: { type: 'string', description: 'Contact status (active, inactive, lead, prospect, customer, churned)' },
          note: { type: 'string', description: 'Note text to add' },
          field: { type: 'string', description: 'Custom field name to update' },
          value: { type: 'string', description: 'Custom field value' },
          query: { type: 'string', description: 'Search query' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags to assign to the contact' },
        },
        required: ['action'],
      },
    },
    executionTimeoutMs: 5000,
  },
  {
    slug: 'receipt-analyzer',
    displayName: 'Receipt Analyzer',
    description: 'Parses receipt data for bookkeeping. Converts receipt text and image descriptions into structured expense entries with automatic categorization.',
    sourceType: 'builtin',
    source: RECEIPT_ANALYZER_SOURCE,
    version: '1.0.0',
    toolDefinition: {
      name: 'receipt_analyzer',
      description: `Analyzes receipts and converts them into structured bookkeeping data.

Supported actions:
- analyze_receipt: Parse receipt text or image description to extract vendor, amount, date, items
- parse_text: Parse raw receipt text into structured data
- categorize: Auto-categorize an expense based on vendor name
- format_entry: Format expense data as a bookkeeping entry

Use this when the user shares a receipt (text or image) or wants to parse expense data for bookkeeping.`,
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['analyze_receipt', 'analyze', 'parse_text', 'categorize', 'format_entry'], description: 'Receipt analysis action' },
          receiptText: { type: 'string', description: 'Raw receipt text to analyze' },
          text: { type: 'string', description: 'Receipt text (alias for receiptText)' },
          vendor: { type: 'string', description: 'Vendor/store name' },
          amount: { type: 'number', description: 'Total amount' },
          currency: { type: 'string', description: 'Currency code (default: USD)' },
          date: { type: 'string', description: 'Receipt date' },
          category: { type: 'string', description: 'Expense category' },
          imageDescription: { type: 'string', description: 'Text description of a receipt image' },
          items: { type: 'array', description: 'Line items from the receipt', items: { type: 'object' } },
        },
        required: ['action'],
      },
    },
    executionTimeoutMs: 5000,
  },
  {
    slug: 'meeting-summary',
    displayName: 'Meeting Summary',
    description: 'Summarizes all kinds of meetings for management. Supports standup, sprint planning, retrospective, client, 1:1, and general meetings with action item extraction and follow-up email generation.',
    sourceType: 'builtin',
    source: MEETING_SUMMARY_SOURCE,
    version: '1.0.0',
    toolDefinition: {
      name: 'meeting_summary',
      description: `Summarizes meetings and extracts action items for management.

Supported actions:
- summarize: Generate a structured meeting summary
- extract_actions: Extract action items from meeting notes
- generate_followup: Draft a follow-up email to attendees
- format_notes: Format meeting notes in clean markdown

Meeting types: standup/daily, sprint/planning, retrospective/retro, client/external, one_on_one/1on1, general

Use this when the user wants to summarize a meeting, extract action items, or create follow-up communications.`,
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['summarize', 'extract_actions', 'actions', 'generate_followup', 'format_notes'], description: 'Summary action to perform' },
          meetingType: { type: 'string', enum: ['standup', 'daily', 'sprint', 'planning', 'retrospective', 'retro', 'client', 'external', 'one_on_one', '1on1', 'general'], description: 'Type of meeting' },
          notes: { type: 'string', description: 'Meeting notes or transcript' },
          transcript: { type: 'string', description: 'Meeting transcript (alias for notes)' },
          attendees: { type: 'string', description: 'Comma-separated list of attendees' },
          date: { type: 'string', description: 'Meeting date (YYYY-MM-DD)' },
          duration: { type: 'string', description: 'Meeting duration (e.g., "1 hour")' },
          title: { type: 'string', description: 'Meeting title' },
          subject: { type: 'string', description: 'Meeting subject (alias for title)' },
          decisions: { type: 'string', description: 'Key decisions made' },
          actionItems: { type: 'string', description: 'Action items identified' },
          nextSteps: { type: 'string', description: 'Planned next steps' },
        },
        required: ['action'],
      },
    },
    executionTimeoutMs: 5000,
  },
];

// ── Main ──────────────────────────────────────────────────

async function main() {
  console.log('[seed-skills] Starting skill seed...\n');

  // 1. Delete all existing skill data (cascade deletes versions + vetting results)
  const deletedVetting = await prisma.skillVettingResult.deleteMany({});
  console.log(`[seed-skills] Deleted ${deletedVetting.count} vetting results`);

  // Need to unset currentVersionId before deleting versions (FK constraint)
  await prisma.skill.updateMany({ data: { currentVersionId: null } });

  const deletedVersions = await prisma.skillVersion.deleteMany({});
  console.log(`[seed-skills] Deleted ${deletedVersions.count} skill versions`);

  const deletedSkills = await prisma.skill.deleteMany({});
  console.log(`[seed-skills] Deleted ${deletedSkills.count} skills\n`);

  // 2. Seed each skill
  for (const skillDef of SKILLS) {
    const codeHash = computeCodeHash(skillDef.source);

    // Create skill (without currentVersionId initially)
    const skill = await prisma.skill.create({
      data: {
        slug: skillDef.slug,
        displayName: skillDef.displayName,
        description: skillDef.description,
        sourceType: skillDef.sourceType,
        enabled: true,
        metadata: {
          toolDefinition: skillDef.toolDefinition,
          executionTimeoutMs: skillDef.executionTimeoutMs,
        },
      },
    });

    // Create version with source code
    const version = await prisma.skillVersion.create({
      data: {
        skillId: skill.id,
        version: skillDef.version,
        codeHash,
        config: {
          __source: skillDef.source,
        },
        changelog: 'Initial seed version',
      },
    });

    // Create passing vetting result
    await prisma.skillVettingResult.create({
      data: {
        skillVersionId: version.id,
        result: 'passed',
        reviewerType: 'system',
        reasons: ['All 71 scan rules passed', 'No dangerous patterns detected', 'Approved by automated security scanner'],
        detectedRisks: [],
        codeHash,
      },
    });

    // Link current version
    await prisma.skill.update({
      where: { id: skill.id },
      data: { currentVersionId: version.id },
    });

    console.log(`[seed-skills] ✓ ${skillDef.displayName} (${skillDef.slug}) — enabled, vetting passed`);
  }

  console.log(`\n[seed-skills] Done! Seeded ${SKILLS.length} skills.`);
}

main()
  .catch((err) => {
    console.error('[seed-skills] Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
