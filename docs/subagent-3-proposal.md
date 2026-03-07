# Sub-Agent 3: Lead Follow-Up / Appointment Recovery Agent

## Problem It Solves

Small business owners lose revenue every day from leads that slip through the cracks. A potential customer sends a message, asks about pricing, or misses an appointment — and nobody follows up. Studies show that 48% of salespeople never follow up with a lead, and 80% of sales require at least 5 follow-ups to close.

The Lead Follow-Up Agent solves this by:
- Automatically identifying conversations where the business hasn't replied
- Drafting warm, professional follow-up messages
- Requiring explicit approval before any message is sent
- Logging all actions for accountability

## Why It Benefits Small Businesses

1. **Revenue recovery**: Re-engages leads that would otherwise be lost
2. **Time savings**: Drafts follow-up messages automatically — the owner just reviews and approves
3. **Consistency**: Ensures no lead goes unfollowed, even during busy periods
4. **Professionalism**: AI-generated messages maintain a friendly, non-pushy tone
5. **Safety-first**: Nothing is sent without explicit human approval
6. **Audit trail**: Every recommendation and action is logged and traceable

## Main Workflow

```
Business Owner: "Show me stale leads"
    |
    v
Agent: Scans conversations for unanswered inbound messages (5+ days default)
    |
    v
Agent: Returns list of stale leads with summary
    |
    v
Owner: "Draft a follow-up for Sarah"
    |
    v
Agent: Generates a friendly follow-up message using LLM
Agent: Persists as a recommendation (status: pending_review)
    |
    v
Owner: "Approve it" / "Change the tone" / "Dismiss"
    |
    v
Agent: Marks as approved (queued for delivery) or dismissed
```

## Inputs / Outputs

### Tool Actions

| Action | Input | Output |
|--------|-------|--------|
| `find_stale` | `staleDays` (optional, default 5) | List of stale conversations with contact info |
| `draft_followup` | `contactQuery`, `context` (optional) | Generated message draft + recommendation record |
| `list_pending` | (uses conversation context) | Pending follow-up recommendations |
| `approve_send` | `recommendationId`, `sendChannel` | Approval confirmation |
| `dismiss` | `recommendationId` | Dismissal confirmation |

### Output Structure

```typescript
interface FollowUpSubAgentOutput {
  success: boolean;
  action: string;
  summary: string;
  recommendations?: FollowUpRecommendation[];
  recommendation?: FollowUpRecommendation;
  error?: string;
  needsApproval?: boolean;
  approvalQuestion?: string;
}
```

### Recommendation Record

Each recommendation tracks:
- Contact identifier and name
- Reason for follow-up (stale_lead, missed_appointment, no_reply, custom)
- AI-generated suggested message
- Priority level (low / medium / high / urgent)
- Next action date
- Status lifecycle: draft -> pending_review -> approved -> sent (or dismissed)

## Safety Boundaries

1. **No auto-send**: Messages are NEVER sent automatically. The owner must explicitly approve each one.
2. **Review-first**: All generated messages start as drafts in `pending_review` status.
3. **Sanitized output**: Generated messages are trimmed, length-capped (500 chars), and stripped of formatting artifacts.
4. **Duplicate prevention**: Cannot create duplicate recommendations for the same contact within 24 hours.
5. **Tone control**: LLM prompt enforces friendly, non-pushy tone. No aggressive sales language.
6. **Full audit trail**: Every recommendation creation, approval, and dismissal is logged via SubAgentTask records.
7. **Graceful fallback**: If LLM draft generation fails, a safe template message is used instead.

## Future Enhancements

- **Scheduled delivery**: Auto-send approved messages at optimal times
- **CRM sync**: Write follow-up notes back to GHL contacts
- **Smart scheduling**: Use past response patterns to suggest best send times
- **Tone selection**: Let the owner choose tone (friendly, professional, urgent)
- **Batch operations**: Approve/dismiss multiple recommendations at once
- **Analytics dashboard**: Track follow-up response rates and recovered leads
- **Appointment-specific**: Deep integration with calendar/appointment systems
- **Multi-channel delivery**: Route approved messages to Telegram, email, or SMS based on original channel
