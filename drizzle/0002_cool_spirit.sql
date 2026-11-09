ALTER TABLE `offers` ADD `rfq_item_id` integer REFERENCES rfq_items(id);--> statement-breakpoint
ALTER TABLE `projects` ADD `customer_contact` text;--> statement-breakpoint
ALTER TABLE `rfq_items` ADD `source_row` integer;