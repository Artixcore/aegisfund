ALTER TABLE `agent_runs` MODIFY COLUMN `agentType` enum(
  'market_analysis',
  'crypto_monitoring',
  'forex_monitoring',
  'futures_commodities',
  'historical_research',
  'executive_briefing'
) NOT NULL;

--> statement-breakpoint

ALTER TABLE `agent_schedules` MODIFY COLUMN `agentType` enum(
  'market_analysis',
  'crypto_monitoring',
  'forex_monitoring',
  'futures_commodities',
  'historical_research',
  'executive_briefing'
) NOT NULL;
