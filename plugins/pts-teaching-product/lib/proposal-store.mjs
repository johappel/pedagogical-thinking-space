// Persistence for the Product Proposal step (Spike Phase 3 §10/§21). The
// proposal lives in `.pts/product-proposal.json` and the snapshot it was built
// from in `.pts/product-snapshot.json`, both next to the Teaching Product
// sidecar in the Denkraum. Keeping the snapshot on disk lets Accept reconstruct
// the exact provenance the proposal was synthesised from — the product is built
// from that same snapshot, never from re-reading the (possibly moved-on)
// Denkstand.
//
// Reload behaviour (Spike §21):
//   * no proposal, no product           → Zustand A
//   * proposal present, no product       → Zustand B (proposal stays visible)
//   * product present                    → Zustand C (proposal is consumed)
//
// This store writes nothing back into the Denkstand, whiteboard or
// LearningMoment ledger — the product boundary stays one-way.

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { PRODUCT_PROPOSAL_SCHEMA } from './proposal.mjs';

export const PROPOSAL_DIR = '.pts';
export const PROPOSAL_FILE = 'product-proposal.json';
export const SNAPSHOT_FILE = 'product-snapshot.json';
const PRODUCT_SNAPSHOT_SCHEMA = 'ptspace.product-snapshot/v1';
const LIMIT = 1024 * 1024;

export class ProposalStoreError extends Error {
	constructor(code, message, detail = {}) {
		super(message);
		this.name = 'ProposalStoreError';
		this.code = code;
		this.detail = detail;
	}
}

function sidecarPath(root, file) {
	if (typeof root !== 'string' || !path.isAbsolute(root)) throw new ProposalStoreError('invalid-root', 'Absoluter Denkraum-Pfad erforderlich');
	return path.join(root, PROPOSAL_DIR, file);
}

export function proposalPath(root) { return sidecarPath(root, PROPOSAL_FILE); }
export function snapshotPath(root) { return sidecarPath(root, SNAPSHOT_FILE); }

async function readJson(target, limitError) {
	let text;
	try {
		text = await fs.readFile(target, 'utf8');
	} catch (err) {
		if (err && err.code === 'ENOENT') return null;
		throw err;
	}
	if (text.length > LIMIT) throw new ProposalStoreError('too-large', limitError);
	try {
		return JSON.parse(text);
	} catch {
		throw new ProposalStoreError('corrupt', `${target} ist kein gültiges JSON`);
	}
}

async function writeJson(target, value) {
	await fs.mkdir(path.dirname(target), { recursive: true });
	const tmp = `${target}.${process.pid}.tmp`;
	await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
	await fs.rename(tmp, target); // atomic swap
	return value;
}

/** Load the proposal, or null when none exists yet. */
export async function loadProposal(root) {
	const value = await readJson(proposalPath(root), 'product-proposal.json überschreitet das Limit');
	if (value === null) return null;
	if (!value || value.schema !== PRODUCT_PROPOSAL_SCHEMA) throw new ProposalStoreError('unsupported', 'Unbekanntes Product-Proposal-Schema');
	return value;
}

export async function saveProposal(root, proposal) {
	if (!proposal || proposal.schema !== PRODUCT_PROPOSAL_SCHEMA) throw new ProposalStoreError('unsupported', 'Kein gültiges Product Proposal');
	return writeJson(proposalPath(root), proposal);
}

export async function deleteProposal(root) {
	try {
		await fs.unlink(proposalPath(root));
	} catch (err) {
		if (!err || err.code !== 'ENOENT') throw err;
	}
}

/** Load the snapshot the proposal was built from, or null. */
export async function loadSnapshot(root) {
	const value = await readJson(snapshotPath(root), 'product-snapshot.json überschreitet das Limit');
	if (value === null) return null;
	if (!value || value.schema !== PRODUCT_SNAPSHOT_SCHEMA) throw new ProposalStoreError('unsupported', 'Unbekanntes Product-Snapshot-Schema');
	return value;
}

export async function saveSnapshot(root, snapshot) {
	if (!snapshot || snapshot.schema !== PRODUCT_SNAPSHOT_SCHEMA) throw new ProposalStoreError('unsupported', 'Kein gültiger Product Snapshot');
	return writeJson(snapshotPath(root), snapshot);
}
