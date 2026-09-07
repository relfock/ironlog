CREATE TABLE `workout_heart_rate_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`bpm` real NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`dirty` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workout_hr_workout_idx` ON `workout_heart_rate_samples` (`workout_id`,`recorded_at`);