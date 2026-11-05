CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer,
	`detail` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_name` text NOT NULL,
	`imported_by` text,
	`row_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'review' NOT NULL,
	`warnings` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`supplier_id` integer NOT NULL,
	`unit_price` real,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`vat_status` text DEFAULT 'unknown' NOT NULL,
	`quotation_date` text,
	`stock_status` text,
	`lead_time` text,
	`shipping_cost` real,
	`shipping_terms` text,
	`source_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `product_specs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`unit` text,
	`source_reference_id` integer,
	`confidence` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_code` text NOT NULL,
	`name` text NOT NULL,
	`manufacturer` text,
	`model_number` text,
	`category` text,
	`description` text,
	`product_url` text,
	`review_status` text DEFAULT 'verified' NOT NULL,
	`source_type` text DEFAULT 'internal' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_product_code_unique` ON `products` (`product_code`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_code` text NOT NULL,
	`customer_name` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'researching' NOT NULL,
	`assigned_to` text,
	`received_at` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_project_code_unique` ON `projects` (`project_code`);--> statement-breakpoint
CREATE TABLE `rfq_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`product_id` integer,
	`requested_description` text NOT NULL,
	`requested_quantity` integer DEFAULT 1 NOT NULL,
	`compliance_status` text DEFAULT 'not_confirmed' NOT NULL,
	`known_deviation` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `source_references` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_label` text,
	`source_url` text,
	`import_batch_id` integer,
	`last_verified_at` text,
	`review_status` text DEFAULT 'review' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_code` text NOT NULL,
	`company_name` text NOT NULL,
	`website` text,
	`email` text,
	`telephone` text,
	`contact_person` text,
	`country` text,
	`dispatch_location` text,
	`verification_status` text DEFAULT 'review' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_supplier_code_unique` ON `suppliers` (`supplier_code`);