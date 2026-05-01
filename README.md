# Wealth Management & Portfolio Rebalancing Engine (PoC)
🚀 **Live Demo:** [Click here to access the running system](https://investments-demo.netlify.app/#)

## 📌 Overview
This project is a Proof of Concept (PoC) for a comprehensive Wealth Management system. Born from the need to manage a complex personal investment portfolio, it has evolved into a logic engine capable of handling fixed and variable income, multi-broker consolidations, portfolio rebalancing, and tax calculations.

The system is built with an **Offline-First / LocalStorage architecture** to ensure maximum user privacy and zero latency during scenario simulations.

## ⚙️ Core Business Logic & Features (Demo Version)

### 1. Trade Management & Settlement
* **Multi-Broker Consolidation:** Manages multiple checking and investment accounts simultaneously.
* **T+2 Settlement Logic:** Incorporates banking holiday calendars to accurately calculate T+2 (D+2) settlement dates for variable income operations.
* **Simulated vs. Manual Ledgers:** Trades can be inputted manually or generated automatically via a "Scenario Simulator" that projects the impact of a trade on dividend yields before execution.

### 2. Portfolio Rebalancing
* Calculates dynamic rebalancing plans based on user-defined target allocations per asset category.
* Computes the ideal versus current percentage and projects the post-contribution allocation automatically.

### 3. Corporate Actions & Dividend Automation
* **Data-Com (Ex-Dividend Date) Engine:** The user inputs the corporate action details (ex-date, payment date, value per share). The engine queries the historical database to determine the exact quantity of shares held across different brokers on that specific ex-date, calculating the precise dividend entitlement and applying withholding tax (IRRF) deductions automatically.

### 4. Tax Compliance Engine & Adjustments
* Calculates average prices (Preço Médio) dynamically following standard Brazilian tax rules.
* Supports complex corporate adjustments like stock splits, reverse splits (grupamento), and automated custody transfers between brokers, seamlessly adjusting the average price without losing historical data.

### 5. Advanced Financial Metrics & Valuation
* **Performance:** Calculates Internal Rate of Return (IRR/TIR), Time-Weighted Return (TWR), and Money-Weighted Return (MWR).
* **Valuation:** Integrates with an external Google Sheets API to fetch real-time market data and fundamental indicators (BVPS, EPS) to calculate Benjamin Graham's Intrinsic Value and Décio Bazin's Maximum Price algorithms.

---

## 🚀 Private Production Environment Highlights
*Note: The features below are actively running in the private, monolithic production version of this system and are slated for future modularization into this PoC repository.*

* **Advanced Rebalancing Parameters:** Implementation of "Safe Mode" (strictly respecting target allocation) and "Opportunistic Mode" (bypassing allocation to suggest assets meeting a dynamic, user-defined profit threshold).
* **Granular Tax Rules (ReVar Compliance):** Strict enforcement of edge-case tax legislations, such as nullifying the standard R$ 20k capital gains tax exemption specifically for "Units".

## 🛠️ Architecture Notes
This PoC branch was deliberately constructed using **Vanilla JavaScript** without heavy frameworks. The primary goal was to validate the complex mathematical models, tax rules, and state management logic through strict modularization (MVC/SoC). For a production-grade environment, the UI layer would be migrated to React/TypeScript, while maintaining this pure, framework-agnostic business logic core.
