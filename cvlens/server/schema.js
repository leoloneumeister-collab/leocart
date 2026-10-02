import { z } from 'zod';

// Input the model fills in after reading the user's CV. Kept loose on purpose
// (dates are plain strings): normalizeCv parses them and reports what it could
// not read, so one odd date does not fail the whole call.

const date = z
  .string()
  .max(40)
  .describe('YYYY-MM or YYYY. Copy the date from the CV; do not guess.');

const experience = z.object({
  title: z.string().max(120).describe('Job title as written on the CV'),
  organization: z.string().max(120).describe('Employer or client'),
  start: date,
  end: date.optional().describe('YYYY-MM or YYYY. Omit, or use "present", for a current job.'),
  skills: z
    .array(z.string().max(60))
    .max(12)
    .optional()
    .describe('Tools, languages, methods the CV says were used in THIS role. Only include what the CV supports.'),
});

const education = z.object({
  title: z.string().max(120).describe('Degree, course or certificate'),
  organization: z.string().max(120).describe('School or provider'),
  start: date,
  end: date.optional(),
});

export const cvInputShape = {
  name: z.string().min(1).max(100).describe("The person's name as on the CV"),
  headline: z.string().max(160).optional().describe('One line about them, e.g. their current title. Optional.'),
  experience: z.array(experience).max(20).describe('Jobs, any order. Include only roles that appear on the CV.'),
  education: z.array(education).max(8).optional().describe('Degrees and courses. Optional.'),
  skills: z
    .array(z.string().max(60))
    .max(40)
    .optional()
    .describe('Extra skills, languages or certificates the CV lists that are not tied to a specific role. Optional.'),
};
