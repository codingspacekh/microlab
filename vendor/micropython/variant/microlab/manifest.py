# The boards' asyncio (extmod/asyncio, with the _asyncio C module), not the webassembly port's, which
# schedules with JavaScript (setTimeout) and imports js / jsffi, gone in this variant.
include("$(MPY_DIR)/extmod/asyncio")
