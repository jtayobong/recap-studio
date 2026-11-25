import { assetRepository } from '../db';
import { createExportStore } from './exportStore';

/** App-wide export UI state. The exporter itself (and Mediabunny) is loaded on first use. */
export const useExportStore = createExportStore(assetRepository);
