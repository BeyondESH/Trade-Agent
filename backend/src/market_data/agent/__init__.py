"""Agent layer: Tier 1 Deep Agents research + Tier 2 deterministic execution.

Two physically separate LangGraph graphs share nothing but the
``StrategyProposal`` contract:

- Tier 1 (research, non-deterministic / LLM) lives in ``research.py``.
- Tier 2 (execution, deterministic / zero-LLM) lives in ``execution.py`` +
  ``broker.py`` + ``proposal.py``.
"""
