CREATE TABLE public.orders (
	id bigserial NOT NULL,
	amount int4 NULL,
	category varchar(255) NULL,
	description varchar(255) NULL,
	payment varchar(255) NULL,
	status varchar(50) NULL,
	CONSTRAINT orders_pkey PRIMARY KEY (id)
);
