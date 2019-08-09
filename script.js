async function main() {
	let data = await fetch("data/map.json")
	let map = await data.json();

	let game = new Game(map);

	game.go();
}

const G_WIDTH = 360;
const G_HEIGHT = 400;
const TILE_SIZE = 32;


class Game {
	constructor(map) {
		let self = this;

		this.canvas = document.querySelector('canvas');
		this.ctx = this.canvas.getContext("2d", {
			alpha: false
		});
		this.canvas.width = G_WIDTH;
		this.canvas.height = G_HEIGHT;
		this.pavements = [];
		this.roads = [];
		this.fn = [];

		this.ctx.scale(0.81, 1.6);

		this.ctx.imageSmoothingEnabled = false;

		this.civils = [];
		this.cops = [];
		this.npcs = [];
		this.civil_cars = [];
		this.cop_cars = [];
		this.cars = [];
		this.bullets = [];
		this.shoot_audio = [];

		this.make_map(map);

		this.player = new Player(this);

		this.spawn = {
			car() {
				let c = new Car(self);

				self.civil_cars.push(c);
			},
			npc() {
				let n = new NPC(self);

				self.civils.push(n);
			},
			cop() {
				let c = new Copcar(self);

				self.cop_cars.push(c);
			}
		}
	}

	get_tile(x, y) {
		return this.map[(y - y % TILE_SIZE) / TILE_SIZE][(x - x % TILE_SIZE) / TILE_SIZE]
	}

	make_map(map) {
		this.map = map;

		for (let [width, row] of map.entries()) {
			for (let [height, cell] of row.entries()) {
				if (cell.is_between(37, 40)) {
					this.pavements.push([height, width]);
					cell = 8;
				}
				else if (cell.is_between(2, 5)) {
					this.roads.push([height, width]);
					cell = 1;
				}
				else if (cell.is_between(33, 36)) {
					cell = 1;
				}

				this.render(ctx => {
					let offset = {
						x: 0,
						y: 0
					}


					if (this.player.x > G_WIDTH / 2)
						offset.x = this.player.x - G_WIDTH / 2;

					if (this.player.y > G_HEIGHT / 4)
						offset.y = this.player.y - G_HEIGHT / 4;

					if ((height * TILE_SIZE - offset.x).is_between(-TILE_SIZE, G_WIDTH + TILE_SIZE * 3) && (width * TILE_SIZE - offset.y).is_between(-TILE_SIZE, G_HEIGHT + TILE_SIZE))
						this.ctx.drawImage(img_map, (cell - 1) * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, height * TILE_SIZE - offset.x, width * TILE_SIZE - offset.y, TILE_SIZE, TILE_SIZE);
				})
			}
		}
	}

	render(fn) {
		this.fn.push(fn);
	}

	hud() {

		this.ctx.fillStyle = "red";
		this.ctx.drawImage(img_hp, 10, 10, Math.round(this.player.hp / 100 * 100), 5);

		if (this.player.in_car) {
			this.ctx.fillStyle = "blue";
			this.ctx.drawImage(img_durability, 10, 20, Math.round(this.cars[this.player.car_id].durability / 100 * 100), 5)
		}
	}

	go() {
		if (!this.game_over) {
			this.ctx.drawImage(img_bground, 0, 0)

			while (this.civils.length < 25) {
				this.spawn.npc();
			}

			while (this.civil_cars.length < 25) {
				this.spawn.car();
			}

			if (this.player.wanted) {
				while (this.cop_cars.length < 25) {
					this.spawn.cop();
				}
			}

			this.cars = this.civil_cars.concat(this.cop_cars);
			this.npcs = this.civils.concat(this.cops);

			for (let fn of this.fn) {
				fn(this.ctx);
			}

			this.player.update();

			for (let [i, npc] of this.npcs.entries()) {
				npc.update();
				if (npc.dead && npc.i > 100) {
					if (i < 25) {
						this.civils.splice(i, 1)
					} else {
						this.cops.splice(i - 25, 1)
					}
				}
			}

			for (let [i, car] of this.cars.entries()) {
				car.update();
				if (car.broken && car.i > 100) {
					if (i < 25) {
						this.civil_cars.splice(i, 1)
					} else {
						this.cop_cars.splice(i - 25, 1)
					}
				}
			}


			for (let [i, bullet] of this.bullets.entries()) {
				bullet.update();
				if (!bullet.going) {
					this.bullets.splice(i, 1)
				}
			}

			//document.querySelector("canvas").getContext("2d").drawImage(this.canvas, 0, 0)

			this.hud();
		}
		else {
			this.ctx.fillStyle = "red";
			this.ctx.fillRect(0, 0, 500, 500)
		}

		requestAnimationFrame(this.go.bind(this))
	}

	p_player_collide(x, y) {
		if (x.is_between(this.player.x, this.player.x + 8) && y.is_between(this.player.y, this.player.y + 8)) {
			return true;
		}
	}


	p_npc_collide(x, y, alive) {
		let id = this.closest_npc(x, y, alive);

		if (typeof id == "number") {
			let npc = this.npcs[id];

			if (x.is_between(npc.x, npc.x + 10) && y.is_between(npc.y, npc.y + 10)) {
				return id;
			}
		}
		return false;
	}

	p_car_collide(x, y, sender) {
		let id = this.closest_car(x, y, null, null, sender);

		if (typeof id == "number") {
			let car = this.cars[id];

			let ctx = this.ctx;
			ctx.save();
			ctx.translate(car.x + 9, car.y + 20);
			ctx.rotate(car.angle.to_rad());
			let matrix = ctx.getTransform().invertSelf();
			ctx.restore();

			let pos = new DOMPoint(x * 0.81, y * 1.6);
			let rel = matrix.transformPoint(pos);

			if (rel.x.is_between(-9, 11) && rel.y.is_between(-20, 11)) {
				return id;
			}
		}
		return false;
	}

	c_npc_collide(car) {
		let { x, y, angle } = car;
		let id = this.closest_npc(x, y, true);

		if (typeof id == "number") {
			let npc = this.npcs[id];
			let ctx = this.ctx;
			ctx.save();
			ctx.translate(x + 9, y + 20);
			ctx.rotate(angle.to_rad());
			let matrix = ctx.getTransform().invertSelf();
			ctx.restore();
			let pos = new DOMPoint((npc.x + 5) * 0.81, (npc.y + 5) * 1.6);
			let rel = matrix.transformPoint(pos);

			if (rel.x.is_between(-9, 11) && rel.y.is_between(-20, 11)) {
				return id;
			}
			return false;
		}
	}

	closest_car(x, y, radius, working, sender) {
		let closest = {
			dist: Number.MAX_SAFE_INTEGER,
			id: null
		}

		for (let [id, car] of this.cars.entries()) {
			if (!(car == sender)) {
				if (working && !car.broken) {
					let delta_x = x - car.x;
					let delta_y = y - car.y;

					let dist = delta_y * delta_y + delta_x * delta_x;

					if (radius) {
						if (dist < closest.dist && dist < radius) {
							closest = {
								dist: dist,
								id: id
							}
						}
					} else {
						if (dist < closest.dist) {
							closest = {
								dist: dist,
								id: id
							}
						}
					}
				} else {
					let delta_x = x - car.x;
					let delta_y = y - car.y;

					let dist = delta_y * delta_y + delta_x * delta_x;

					if (radius) {
						if (dist < closest.dist && dist < radius) {
							closest = {
								dist: dist,
								id: id
							}
						}
					} else {
						if (dist < closest.dist) {
							closest = {
								dist: dist,
								id: id
							}
						}
					}
				}
			}
		}
		return closest.id;
	}

	closest_npc(x, y, alive) {
		let closest = {
			dist: Number.MAX_SAFE_INTEGER,
			id: null
		}

		for (let [id, npc] of this.npcs.entries()) {
			if (alive && !npc.dead) {
				let delta_x = x - npc.x;
				let delta_y = y - npc.y;

				let dist = delta_y * delta_y + delta_x * delta_x;

				if (dist < closest.dist) {
					closest = {
						dist: dist,
						id: id
					}
				}
			}
		}

		return closest.id;
	}

	car_collision(car) {
		const width = 20;
		const height = 29;

		let { x, y } = car;

		let cx = x + 9
		let cy = y + 20;

		let tmp_x = x - cx;
		let tmp_y = y - cy;

		let points = [{
			x: (tmp_x * Math.cos(car.angle.to_rad()) - tmp_y * Math.sin(car.angle.to_rad())) + x + 9,
			y: (tmp_x * Math.sin(car.angle.to_rad()) + tmp_y * Math.cos(car.angle.to_rad())) + y + 20
		}, {
			x: ((tmp_x + width) * Math.cos(car.angle.to_rad()) - tmp_y * Math.sin(car.angle.to_rad())) + x + 9,
			y: ((tmp_x + width) * Math.sin(car.angle.to_rad()) + tmp_y * Math.cos(car.angle.to_rad())) + y + 20
		}, {
			x: (tmp_x * Math.cos(car.angle.to_rad()) - (tmp_y + height) * Math.sin(car.angle.to_rad())) + x + 9,
			y: (tmp_x * Math.sin(car.angle.to_rad()) + (tmp_y + height) * Math.cos(car.angle.to_rad())) + y + 20
		}, {
			x: ((tmp_x + width) * Math.cos(car.angle.to_rad()) - (tmp_y + height) * Math.sin(car.angle.to_rad())) + x + 9,
			y: ((tmp_x + width) * Math.sin(car.angle.to_rad()) + (tmp_y + height) * Math.cos(car.angle.to_rad())) + y + 20
		}]

		let tiles = [
			this.get_tile(points[0].x, points[0].y),
			this.get_tile(points[1].x, points[1].y),
			this.get_tile(points[2].x, points[2].y),
			this.get_tile(points[3].x, points[3].y)
		]

		const solid = [10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 41]


		for (let tile of tiles) {
			if (solid.includes(tile)) {
				return true;
			}
		}

		tiles = [
			this.p_car_collide(points[0].x, points[0].y, car),
			this.p_car_collide(points[1].x, points[1].y, car),
			this.p_car_collide(points[2].x, points[2].y, car),
			this.p_car_collide(points[3].x, points[3].y, car)
		]
		for (let tile of tiles) {
			if (typeof tile == "number") {
				return true;
			}
		}
		return false;
	}

	map_collide(x, y, width, height) {
		if (x, y) {
			let points = [{
				x: x,
				y: y
			}, {
				x: x + width,
				y: y
			}, {
				x: x,
				y: y + height
			}, {
				x: x + width,
				y: y + height
			}]

			let tiles = [
				this.get_tile(points[0].x, points[0].y),
				this.get_tile(points[1].x, points[1].y),
				this.get_tile(points[2].x, points[2].y),
				this.get_tile(points[3].x, points[3].y)
			]

			const solid = [10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 41]


			for (let tile of tiles) {
				if (solid.includes(tile)) {
					return true;
				}
			}
			return false;
		}
	}
}

Number.prototype.is_between = function (f, s) {
	if (this >= f && this <= s)
		return true;
	return false;
}

Number.prototype.to_deg = function () {
	return this * 180 / Math.PI
}

Number.prototype.to_rad = function () {
	return this * Math.PI / 180
}

class Player {
	constructor(game) {
		let mouse = {
			x: 0,
			y: 0
		};

		let rand = Math.floor(Math.random() * game.pavements.length);

		this.x = game.pavements[rand][0] * TILE_SIZE + 8;
		this.y = game.pavements[rand][1] * TILE_SIZE + 8;

		this.cooldown = false;
		this.step_cd = false;
		this.in_car = false;

		this.wanted = false;

		document.addEventListener("mousemove", e => {
			mouse.x = (e.pageX / innerWidth) * (360 * 1.235);
			mouse.y = (e.pageY / innerHeight) * (400 * 0.625);
		})

		this.visible_position = {
			x: 0,
			y: 0
		}

		this.img = img_player;

		let going = {
			left: false,
			right: false,
			up: false,
			down: false
		}

		this.hp = 100;

		this.shoot = false;

		this.in_car = false;

		this.snd_step = new StepAudio();
		this.snd_shoot = new ShootAudio();

		document.addEventListener("keydown", e => {
			if (e.key == "w")
				going.up = true;
			if (e.key == "s")
				going.down = true;
			if (e.key == "a")
				going.left = true;
			if (e.key == "d")
				going.right = true;
		})

		document.addEventListener("keyup", e => {
			if (e.key == "w")
				going.up = false;
			if (e.key == "s")
				going.down = false;
			if (e.key == "a")
				going.left = false;
			if (e.key == "d")
				going.right = false;
		})

		document.addEventListener("keydown", e => {
			if (e.key == "f") {
				if (!this.in_car) {
					let id = game.closest_car(this.x, this.y, 100000);
					if (typeof id == "number") {
						this.car_id = id;
						this.game.cars[id].get_inside();
					}
				}
				else {
					if (typeof this.car_id == "number")
						game.cars[this.car_id].get_outside();
					else
						game.cops[this.cop_id].get_outside();
				}
			}
		})

		document.addEventListener("mousedown", e => {
			this.shoot = true;
		})

		document.addEventListener("mouseup", e => {
			this.shoot = false;
		})

		this.going = going;
		this.mouse = mouse;
		this.game = game;
	}

	hit() {
		this.hp -= 33;
	}

	update() {
		if (this.hp < 0) {
			this.game.game_over = true;
		}
		else if (this.hp < 100) {
			this.hp += 0.2;
		}

		if (!this.in_car) {
			let ctx = this.game.ctx;

			const SPEED = 1;

			let going = this.going;
			let mouse = this.mouse;
			let step = false;

			if (going.up) {
				this.y -= SPEED;
				step = true;
				if (this.game.map_collide(this.x, this.y, 10, 10) || this.game.p_car_collide(this.x, this.y, null) || this.game.p_car_collide(this.x + 10, this.y, null) || this.game.p_car_collide(this.x, this.y + 10, null) || this.game.p_car_collide(this.x + 10, this.y + 10, null)) {
					this.y += SPEED
				}
			}
			if (going.down) {
				this.y += SPEED;
				step = true;
				if (this.game.map_collide(this.x, this.y, 10, 10) ||this.game.p_car_collide(this.x, this.y, null) || this.game.p_car_collide(this.x + 10, this.y, null) || this.game.p_car_collide(this.x, this.y + 10, null) || this.game.p_car_collide(this.x + 10, this.y + 10, null)) {
					this.y -= SPEED
				}
			}
			if (going.left) {
				this.x -= SPEED;
				step = true;
				if (this.game.map_collide(this.x, this.y, 10, 10) || this.game.p_car_collide(this.x, this.y, null) || this.game.p_car_collide(this.x + 10, this.y, null) || this.game.p_car_collide(this.x, this.y + 10, null) || this.game.p_car_collide(this.x + 10, this.y + 10, null)) {
					this.x += SPEED
				}
			}
			if (going.right) {
				this.x += SPEED;
				step = true;
				if (this.game.map_collide(this.x, this.y, 10, 10) || this.game.p_car_collide(this.x, this.y, null) || this.game.p_car_collide(this.x + 10, this.y, null) || this.game.p_car_collide(this.x, this.y + 10, null) || this.game.p_car_collide(this.x + 10, this.y + 10, null)) {
					this.x -= SPEED
				}
			}

			if (step && !this.step_cd) {
				this.snd_step.update();
				this.step_cd = true;
				setTimeout(() => {
					this.step_cd = false;
				}, 500)
			}

			if (this.shoot) {
				if (!this.cooldown) {
					new Bullet(this.game, this);

					this.snd_shoot.update();

					this.cooldown = true;
					setTimeout(() => {
						this.cooldown = false;
					}, 100)
				}
			}


			let delta = {
				x: this.visible_position.x + 5 - mouse.x,
				y: this.visible_position.y + 5 - mouse.y
			}
			let angle = Math.atan2(delta.y, delta.x);

			if (this.x > G_WIDTH / 2)
				this.visible_position.x = G_WIDTH / 2;
			else
				this.visible_position.x = this.x;

			if (this.y > G_HEIGHT / 4)
				this.visible_position.y = G_HEIGHT / 4;
			else
				this.visible_position.y = this.y;

			this.angle = angle;

			this.snd_shoot.play();
			this.snd_step.play();

			ctx.save();
			ctx.translate(this.visible_position.x + 5, this.visible_position.y + 5);
			ctx.rotate(angle);
			ctx.drawImage(this.img, -5, -5);
			ctx.restore();
		}
	}
}

class Car {
	constructor(game) {
		let self = this;

		this.v = 0;

		this.durability = 100;
		this.broken = false;

		this.i = 0;

		let rand = Math.floor(Math.random() * game.roads.length);
		this.x = game.roads[rand][0] * TILE_SIZE;
		this.y = game.roads[rand][1] * TILE_SIZE;

		if (game.get_tile(this.x, this.y) == 2) {
			this.angle = 90;
		}
		else if (game.get_tile(this.x, this.y) == 3) {
			this.angle = 270;
		}
		else if (game.get_tile(this.x, this.y) == 4) {
			this.angle = 360;
		} else {
			this.angle = 180;
		}

		this.img = img_car;

		this.driver_inside = true;
		this.player_inside = false;

		this.visible_position = {
			x: 0,
			y: 0
		}

		let going = {
			left: false,
			right: false,
			up: false,
			down: false
		}
		this.i = 0;

		document.addEventListener("keydown", e => {
			if (this.player_inside) {
				if (e.key == "w")
					going.up = true;
				if (e.key == "s")
					going.down = true;
				if (e.key == "a")
					going.left = true;
				if (e.key == "d")
					going.right = true;
			}

		})

		document.addEventListener("keyup", e => {
			if (this.player_inside) {
				if (e.key == "w")
					going.up = false;
				if (e.key == "s")
					going.down = false;
				if (e.key == "a")
					going.left = false;
				if (e.key == "d")
					going.right = false;
			}
		})

		this.snd = new CarAudio();

		this.going = going;
		this.game = game;
	}

	hit() {
		this.durability -= 5;
	}

	get_inside() {
		this.player.wanted = true;
		this.game.player.in_car = true;
		this.driver_inside = false;
		this.player_inside = true;
	}

	get_outside() {
		this.game.player.in_car = false;
		this.player_inside = false;
	}

	empty() {
		if (this.game.car_collision(this)) {
			this.v = -this.v;
			this.durability -= Math.abs(this.v);
		}

		this.going.left = false
		this.going.right = false
		this.going.up = false
		this.going.down = false

		if (this.game.player.x > G_WIDTH / 2)
			this.offset.x = this.game.player.x - G_WIDTH / 2;

		if (this.game.player.y > G_HEIGHT / 4)
			this.offset.y = this.game.player.y - G_HEIGHT / 4;
	}

	ai() {
		if (this.game.player.x > G_WIDTH / 2)
			this.offset.x = this.game.player.x - G_WIDTH / 2;

		if (this.game.player.y > G_HEIGHT / 4)
			this.offset.y = this.game.player.y - G_HEIGHT / 4;

		this.v = 1;


		let detector_1 = this.game.p_car_collide( this.x 	   + Math.sin(this.angle.to_rad()) * 55,  this.y       - Math.cos(this.angle.to_rad()) * 55, 2, 2) || this.game.p_player_collide( this.x       + Math.sin(this.angle.to_rad()) * 35, (this.y + 10)  - Math.cos(this.angle.to_rad()) * 35, 2, 2)
		let detector_2 = this.game.p_car_collide((this.x + 5)  + Math.sin(this.angle.to_rad()) * 45, (this.y + 5)  - Math.cos(this.angle.to_rad()) * 45, 2, 2) || this.game.p_player_collide((this.x + 5)  + Math.sin(this.angle.to_rad()) * 30, (this.y + 15) - Math.cos(this.angle.to_rad()) * 30, 2, 2)
		let detector_3 = this.game.p_car_collide((this.x + 10) + Math.sin(this.angle.to_rad()) * 35, (this.y + 10) - Math.cos(this.angle.to_rad()) * 35, 2, 2) || this.game.p_player_collide((this.x + 10) + Math.sin(this.angle.to_rad()) * 25, (this.y + 20) - Math.cos(this.angle.to_rad()) * 25, 2, 2)
		let detector_4 = this.game.p_car_collide((this.x + 15) + Math.sin(this.angle.to_rad()) * 45, (this.y + 15) - Math.cos(this.angle.to_rad()) * 45, 2, 2) || this.game.p_player_collide((this.x + 15) + Math.sin(this.angle.to_rad()) * 30, (this.y + 25) - Math.cos(this.angle.to_rad()) * 30, 2, 2)
		let detector_5 = this.game.p_car_collide((this.x + 20) + Math.sin(this.angle.to_rad()) * 55, (this.y + 20) - Math.cos(this.angle.to_rad()) * 55, 2, 2) || this.game.p_player_collide((this.x + 20) + Math.sin(this.angle.to_rad()) * 35, (this.y + 30) - Math.cos(this.angle.to_rad()) * 35, 2, 2)

		if (detector_1 || detector_2 || detector_3 || detector_4 || detector_5) {
			this.v = 0;
		}

		const TRN = 0.9;

		if (this.turning) {
			if (this.v == 1) {
				if (this.turning_right) {
					this.angle -= TRN;
					if (Math.round(this.angle) == 90) {
						this.angle = 90;
						this.turning = false;
						this.turning_right = false;
					}
				}
				else if (this.turning_left) {
					this.angle -= TRN;
					if (Math.round(this.angle) == 270) {
						this.angle = 270;
						this.turning = false;
						this.turning_left = false;
					}
				}
				else if (this.turning_top) {
					this.angle -= TRN;
					if (Math.round(this.angle) == 0) {
						this.angle = 360;
						this.turning = false;
						this.turning_top = false;
					}
				}
				else if (this.turning_down) {
					this.angle -= TRN;
					if (Math.round(this.angle) == 180) {
						this.angle = 180;
						this.turning = false;
						this.turning_down = false;
					}
				}
			}
		}
		else {
			let tile = this.game.get_tile(this.x + 10, this.y + 15);
			if (tile == 33 && this.angle == 360) {
				this.turning = true;
				this.turning_left = true;
			}
			else if (tile == 34 && this.angle == 270) {
				this.turning = true;
				this.turning_down = true;
			}
			else if (tile == 35 && this.angle == 180) {
				this.turning = true;
				this.turning_right = true;
			}
			else if (tile == 36 && this.angle == 90) {
				this.turning = true;
				this.turning_top = true;
			}
		}

	}

	player() {
		if (this.game.car_collision(this)) {
			this.durability -= Math.abs(this.v);
			this.v = -this.v;
		}

		if (this.x > G_WIDTH / 2)
			this.visible_position.x = G_WIDTH / 2;
		else
			this.visible_position.x = this.x;

		if (this.y > G_HEIGHT / 4)
			this.visible_position.y = G_HEIGHT / 4;
		else
			this.visible_position.y = this.y;


		this.game.player.x = this.x;
		this.game.player.y = this.y;
	}

	broke() {
		this.img = img_brk;
		this.v = 0;
		this.driver_inside = false;
		if (this.player_inside) {
			this.get_outside();
		}

		this.broken = true;
	}

	update() {

		if (this.durability < 0) {
			this.broke();
		}

		if (this.broken) {
			this.i++;
		}

		let npc = this.game.c_npc_collide(this);

		if (typeof npc == "number") {
			this.game.npcs[npc].die();
		}

		const ACCELERATION = 0.01;
		const BREAK = 0.03;
		const MAX_SPEED = 4;
		const MIN_SPEED = -1;
		const MAX_HANDLING = 0.02;
		const HANDLING = (Math.cos(this.v * 1 / 2) + 1) * MAX_HANDLING;
		const SLOWING = 0.01;

		let ctx = this.game.ctx;

		this.offset = {
			x: 0,
			y: 0
		}

		if (this.game.player.x > G_WIDTH / 2)
			this.offset.x = this.game.player.x - G_WIDTH / 2;

		if (this.game.player.y > G_HEIGHT / 4)
			this.offset.y = this.game.player.y - G_HEIGHT / 4;

		this.visible_position = {
			x: this.x - this.offset.x,
			y: this.y - this.offset.y
		}

		if (this.driver_inside) {
			this.ai();
		}
		else if (this.player_inside) {
			this.player();
		}
		else {
			this.empty();
		}

		this.x += Math.sin(this.angle.to_rad()) * this.v;
		this.y -= Math.cos(this.angle.to_rad()) * this.v;

		let going = this.going;

		if (going.up && this.v < MAX_SPEED) {
			if (this.v >= 0) {
				this.v += ACCELERATION;
			}
			else {
				this.v += BREAK;
			}
		}
		else if (going.down && this.v > MIN_SPEED) {
			if (this.v >= 0) {
				this.v -= BREAK;
			}
			else {
				this.v -= ACCELERATION;
			}
		}
		else {
			this.v > 0 ? this.v -= SLOWING : this.v += SLOWING;
		}

		if (going.right) {
			this.angle += (HANDLING * this.v).to_deg();
		}
		if (going.left) {
			this.angle -= (HANDLING * this.v).to_deg();
		}

		this.audio();

		this.addition();


		ctx.save();
		ctx.translate(this.visible_position.x + 9, this.visible_position.y + 20);
		ctx.rotate(this.angle.to_rad());
		ctx.drawImage(this.img, -9, -20);
		ctx.restore();
	}
	audio() {
		if (this.snd) {
			this.snd.play(this.v);
			let x = this.x - this.game.player.x;
			let y = this.y - this.game.player.y;

			this.snd.vol(0.1 - (Math.sqrt(x * x + y * y)) * 0.01)
		}
	}
	addition() { }
}

class NPC {
	constructor(game) {
		let rand = Math.floor(Math.random() * game.pavements.length);

		this.x = game.pavements[rand][0] * TILE_SIZE + 11;
		this.y = game.pavements[rand][1] * TILE_SIZE + 11;

		this.dead = false;

		this.img = img_npc;

		this.angle = 0;
		this.game = game;
	}

	die(id) {
		this.game.player.wanted = true;

		this.dead = true;
		this.img = img_blood;
		this.id = id
		this.i = 0;
	}

	update() {
		if (!this.dead) {
			let d1 = this.game.get_tile(this.x - 10, this.y - 10);
			let d2 = this.game.get_tile(this.x + 20, this.y + 20);


			const SPEED = 0.4;

			if (d2 == 37) {
				if (d1 == 40) {
					this.y += SPEED;
				} else {
					this.x += SPEED;
				}
			}
			else if (d2 == 38) {
				if (d1 == 37) {
					this.x += SPEED;
				} else {
					this.y -= SPEED;
				}
			}
			else if (d1 == 39) {
				if (d2 == 38) {
					this.y -= SPEED;
				} else {
					this.x -= SPEED;
				}
			}
			else if (d1 == 40) {
				if (d2 == 39) {
					this.x -= SPEED;
				} else {
					this.y += SPEED;
				}
			}
		}
		else {
			this.i++;
		}

		this.offset = {
			x: 0,
			y: 0
		}

		if (this.game.player.x > G_WIDTH / 2)
			this.offset.x = this.game.player.x - G_WIDTH / 2;

		if (this.game.player.y > G_HEIGHT / 4)
			this.offset.y = this.game.player.y - G_HEIGHT / 4;

		this.visible_position = {
			x: this.x - this.offset.x,
			y: this.y - this.offset.y
		}

		this.game.ctx.drawImage(this.img, this.visible_position.x, this.visible_position.y);
	}
}

class Bullet {
	constructor(game, sender) {
		this.x = sender.x + 4;
		this.y = sender.y + 4;

		this.angle = sender.angle + Math.PI * (3 / 2);

		this.x += Math.sin(this.angle) * 10;
		this.y -= Math.cos(this.angle) * 10;

		this.img = img_bullet;

		this.visible_position = {}
		this.offset = {
			x: 0,
			y: 0
		};

		this.going = true;

		game.bullets.push(this);

		this.i = 0;

		this.game = game;
	}

	update() {
		const SPEED = 10;
		this.i++;
		if (this.i > 50)
			this.going = false;
		let hit = this.game.p_npc_collide(this.x, this.y, true);

		if (typeof hit == "number") {
			this.game.npcs[hit].die();
			this.going = false;
		} else {
			let hit = this.game.p_car_collide(this.x, this.y);
			if (typeof hit == "number") {
				this.game.cars[hit].hit();
				this.going = false;
			} else {
				let hit = this.game.map_collide(this.x, this.y, 2, 2);
				if (hit) {
					this.going = false;
				} else {
					let hit = this.game.p_player_collide(this.x, this.y);
					if (hit) {
						this.game.player.hit();
						this.going = false;
					}
				}
			}
		}

		this.x += Math.sin(this.angle) * SPEED;
		this.y -= Math.cos(this.angle) * SPEED;

		if (this.game.player.x > G_WIDTH / 2)
			this.offset.x = this.game.player.x - G_WIDTH / 2;

		if (this.game.player.y > G_HEIGHT / 4)
			this.offset.y = this.game.player.y - G_HEIGHT / 4;

		this.visible_position = {
			x: this.x - this.offset.x,
			y: this.y - this.offset.y
		}

		this.game.ctx.drawImage(this.img, this.visible_position.x, this.visible_position.y);
	}

}

class Copcar extends Car {
	constructor(game) {
		super(game);
		this.img = img_copcar;
		this.snd = new CopAudio();
	}

	ai() {
		let delta_x = this.x - this.game.player.x;
		let delta_y = this.y - this.game.player.y;

		let dist = delta_y * delta_y + delta_x * delta_x;

		if (dist < 10000) {
			this.cop_get_out();
		}
	}

	cop_get_out() {
		this.driver_inside = false;
		this.c1 = new Cop(this.game, this.x, this.y + 10);
		this.c2 = new Cop(this.game, this.x, this.y - 10);
		this.game.cops.push(this.c1, this.c2);
	}
}

class Cop extends NPC {
	constructor(game, x, y) {
		super(game);
		this.x = x;
		this.offset = {};
		this.visible_position = {};
		this.y = y;
		this.img = img_cop;
		this.cd = false;
	}
	update() {
		if (!this.dead) {
			let delta_x = this.x - this.game.player.x;
			let delta_y = this.y - this.game.player.y;

			let dist = delta_y * delta_y + delta_x * delta_x;

			if (dist < 10000) {
				let delta = {
					x: (this.visible_position.x + 5) - (this.game.player.visible_position.x + 5),
					y: (this.visible_position.y + 5) - (this.game.player.visible_position.y + 5)
				}
				this.angle = Math.atan2(delta.y, delta.x);


				if (!this.cd) {
					new Bullet(this.game, this)
					this.cd = true;

					setTimeout(() => {
						this.cd = false;
					}, 500)
				}
			}
		}
		else {
			this.i++;
		}

		if (this.game.player.x > G_WIDTH / 2)
			this.offset.x = this.game.player.x - G_WIDTH / 2;

		if (this.game.player.y > G_HEIGHT / 4)
			this.offset.y = this.game.player.y - G_HEIGHT / 4;

		this.visible_position = {
			x: this.x - this.offset.x,
			y: this.y - this.offset.y
		}

		this.game.ctx.drawImage(this.img, this.visible_position.x, this.visible_position.y);

	}
}

class Audio {
	constructor() {
		let ctx = new (window.AudioContext || window.webkitAudioContext)();
		let gain = ctx.createGain();
		let osc = ctx.createOscillator();

		osc.connect(gain);
		gain.connect(ctx.destination);

		gain.gain.value = 0;

		osc.frequency.value = 1500;
		osc.start();

		osc.type = 'square'


		this.i = 0;
		this.j = 200;

		this.ctx = ctx;
		this.gain = gain;
		this.osc = osc
	}

	vol(v) {
		if (!(v > 0))
			v = 0;
		this.gain.gain.value = v;
	}

	stop() {
		this.osc.stop();
	}
}

class CarAudio extends Audio {
	constructor() {
		super();
	}

	play(v) {
		this.osc.type = 'square'
		this.osc.frequency.value = (Math.sin(++this.i * Math.PI / 2) * 100) + v * 100;
	}
}

class CopAudio extends Audio {
	constructor() {
		super();
	}

	play() {
		this.osc.type = 'square'
		this.osc.frequency.value = Math.cos(++this.i * 50) * 700 + 1500;
	}
}

class ShootAudio extends Audio {
	constructor() {
		super();
	}
	play() {
		this.gain.gain.value = this.i;
		this.osc.frequency.value = this.j;
		if (this.i > 0)
			this.i -= 0.05;
		else
			this.i = 0;
		this.j -= 6;
	}

	update() {
		this.gain.gain.value = 0.1;
		this.osc.frequency.value = 100;
		this.i = this.gain.gain.value;
		this.j = this.osc.frequency.value;
	}
}

class StepAudio extends Audio {
	constructor() {
		super();
	}
	play() {
		this.gain.gain.value = this.i;
		this.osc.frequency.value = this.j;
		if (this.i > 0)
			this.i -= 0.01;
		else
			this.i = 0;
		this.j -= 3;
	}

	update() {
		this.gain.gain.value = 0.05;
		this.osc.frequency.value = 200;
		this.i = this.gain.gain.value;
		this.j = this.osc.frequency.value;
	}
}

main();