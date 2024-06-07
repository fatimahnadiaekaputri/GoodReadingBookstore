const knex = require('knex');
const knexConfig = require('./knexfile');
const db = knex(knexConfig.development);
module.exports = db;

const express = require('express');
const app = express();
app.use(express.json());

// Mencari data buku berdasarkan nama buku
app.get('/api/books/:Book_Name', async (req, res) => {
    const { Book_Name } = req.params;
    try {
        await db.transaction(async trx => {
            const book = await trx('public.Book')
                .where({ Book_Name })
                .first();

            if (!book) {
                return res.status(404).json({ message: 'Book not found' });
            }
            const books = await trx('public.Book_View as b')
                .select(
                    'b.Book_Name',
                    'b.Publication_Year',
                    'b.Pages',
                    'b.Publisher_Name',
                    'b.Display_Name',
                    'b.Location',
                    'b.Quantity',
                    'b.Display_Created',
                    'b.Display_Updated',
                    'b.Author_Name'
                )
                .where('b.Book_Number', book.Book_Number);
            if (books.length === 0) {
                return res.status(404).json({ message: 'Buku yang Anda cari tidak tersedia' });
            }
            res.json(books);
        });

    } catch (err) {
        console.error('Error dalam mengambil data:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Menambahkan wishlist
app.post('/api/insert_wishlist', async (req, res) => {
    const { Book_Name, Username, Wishlist_Number } = req.body;

    try {
        await db.transaction(async trx => {

            const username = await trx('public.Users')
                .where({ Username })
                .first();

            if (!username) {
                return res.status(404).json({ message: 'Username tidak ditemukan' });
            }
            const displayRecord = await trx('public.Book_View as b')
                .select('b.Book_Number')
                .where('b.Book_Name', Book_Name)
                .first();
            if (!displayRecord) {
                return res.status(404).json({ message: 'Buku tidak ditemukan' });
            }

            const newBookNumber = displayRecord.Book_Number;
            const wishlistNumber = Wishlist_Number;

            await trx('public.Wishlist')
                .insert({
                    Wishlist_Number,
                    Wishlist_Created: new Date(),
                    Wishlist_Updated: new Date(),
                    User_Number: username.User_Number
                });

            await trx('public.Wishlist_Book').insert({
                Wishlist_Wishlist_Number: wishlistNumber,
                Book_Book_Number: newBookNumber
            });
            res.json({ message: 'Buku berhasil ditambahkan ke dalam wishlist Anda' });
        });

    } catch (err) {
        console.error('Error dalam menambahkan buku:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

//Menambahkan ke keranjang dari wishlist dan mengurangi quantity display
app.post('/api/add_cart', async (req, res) => {
    const { Book_Name, Username, Cart_Number, Quantity, Price, Discount } = req.body;
    try {
        await db.transaction(async trx => {
            const username = await trx('public.Users')
                .where({ Username })
                .first();

            if (!username) {
                return res.status(404).json({ message: 'Username tidak ditemukan' });
            }

            const bookRecord = await trx('public.Book_View as b')
                .select('b.Book_Number')
                .where('b.Book_Name', Book_Name)
                .first();

            if (!bookRecord) {
                return res.status(404).json({ message: 'Buku tidak ditemukan' });
            }

            const bookNumber = bookRecord.Book_Number;

            const wishlistRecord = await trx('public.Wishlist_Book as wb')
                .join('public.Wishlist as w', 'wb.Wishlist_Wishlist_Number', 'w.Wishlist_Number')
                .where('w.User_Number', username.User_Number)
                .andWhere('wb.Book_Book_Number', bookNumber)
                .first();

            if (!wishlistRecord) {
                return res.status(404).json({ message: 'Buku tidak ada di dalam wishlist, silakan masukkan ke dalam wishlist terlebih dahulu' });
            }

            const displayRecord = await trx('public.Display')
                .where('Book_Number', bookNumber)
                .first();

            if (!displayRecord) {
                return res.status(404).json({ message: 'Book not found in display' });
            }

            if (displayRecord.Quantity <= 0) {
                return res.status(400).json({ message: 'Book is out of stock' });
            }

            const [cartId] = await trx('public.Cart').insert({
                Cart_Number,
                User_Number: username.User_Number,
                Quantity,
                Price,
                Discount,
                Created_Cart: new Date(),
                Updated_Cart: new Date()
            }).returning('Cart_Number');

            await trx('public.Cart_Book').insert({
                Cart_Cart_Number: cartId.Cart_Number,
                Book_Book_Number: bookNumber
            });

            await trx('public.Display')
                .where('Book_Number', bookNumber)
                .update({
                    Quantity: displayRecord.Quantity - 1,
                    Display_Updated: new Date()
                });

            res.json({ message: 'Buku berhasil masuk ke dalam keranjang Anda' });
        });

    } catch (err) {
        console.error('Error dalam melakukan proses:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

//Menghapus wishlist
app.delete('/api/delete_wishlist', async (req, res) => {
    const { Book_Name } = req.body;
    try {
        await db.transaction(async trx => {
            const bookRecord = await trx('public.Book')
                .where('Book_Name', Book_Name)
                .first();

            if (!bookRecord) {
                return res.status(404).json({ message: 'Buku tidak ditemukan' });
            }

            const wishlistRecord = await trx('public.Wishlist_Book')
                .where('Book_Book_Number', bookRecord.Book_Number)
                .first();

            if (!wishlistRecord) {
                return res.status(404).json({ message: 'Buku tidak berada di dalam wishlist' });
            }

            await trx('public.Wishlist')
                .where('Wishlist_Number', wishlistRecord.Wishlist_Wishlist_Number)
                .del();

            await trx('public.Wishlist_Book')
                .where('Book_Book_Number', bookRecord.Book_Number)
                .del();

            res.json({ message: 'Buku berhasil terhapus dari wishlist!' });
        });

    } catch (err) {
        console.error('Error dalam menghapus buku:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Menambahkan display oleh karyawanbuku 
app.post('/api/add_display', async (req, res) => {
    const { Book_Name, Display_Number, Display_Name, Location, Quantity, Staff_Name } = req.body;
    try {
        await db.transaction(async trx => {

            const staff = await trx('public.Staff')
                .where({ Staff_Name })
                .first();

            if (!staff) {
                return res.status(404).json({ message: 'Nama staff tidak ditemukan' });
            }
            const book = await trx('public.Book')
                .where({ Book_Name })
                .first();

            if (!book) {
                return res.status(404).json({ message: 'Buku tidak ditemukan' });
            }

            const [display] = await trx('public.Display')
                .insert({
                    Display_Number,
                    Display_Name,
                    Location,
                    Quantity,
                    Display_Created: new Date(),
                    Display_Updated: new Date(),
                    Book_Number: book.Book_Number
                })
                .returning('*');

            await trx('public.Staff_Display')
                .insert({
                    Staff_Staff_Number: staff.Staff_Number,
                    Display_Display_Number: display.Display_Number
                });

            res.json({ message: 'Buku berhasil ditambahkan ke dalam display' });
        });
    } catch (error) {
        console.error('Error dalam menambahkan buku:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

//Update data buku di display oleh karyawan
app.put('/api/update_display', async (req, res) => {
    const { Book_Name, Display_Name, Location, Quantity, Staff_Name } = req.body;

    try {
        await db.transaction(async trx => {

            const staff = await trx('public.Staff')
                .where({ Staff_Name })
                .first();

            if (!staff) {
                return res.status(404).json({ message: 'Nama staff tidak ditemukan' });
            }

            const book = await trx('public.Book')
                .where({ Book_Name })
                .first();

            if (!book) {
                return res.status(404).json({ message: 'Buku tidak ditemukan' });
            }

            // Cari entri display berdasarkan Book_Number
            const display = await trx('public.Display')
                .where({ Book_Number: book.Book_Number })
                .first();

            if (!display) {
                return res.status(404).json({ message: 'Buku tidak berada di display' });
            }

            // Perbarui data di tabel Display
            await trx('public.Display')
                .where({ Display_Number: display.Display_Number })
                .update({
                    Display_Name,
                    Location,
                    Quantity,
                    Display_Updated: new Date()
                });

            // Tambahkan data ke tabel Staff_Display
            await trx('public.Staff_Display')
                .insert({
                    Staff_Staff_Number: staff.Staff_Number,
                    Display_Display_Number: display.Display_Number
                });

            res.json({ message: 'Display berhasil diperbarui!' });
        });
    } catch (error) {
        console.error('Error dalam memperbarui display:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

//Menambahkan review buku oleh pengguna
app.post('/api/add_review', async (req, res) => {
    const { Book_Name, Review_Number, Rating, Text, Username } = req.body;

    try {
        await db.transaction(async trx => {
            // Cari buku berdasarkan Book_Name
            const username = await trx('public.Users')
                .where({ Username })
                .first();

            if (!username) {
                return res.status(404).json({ message: 'Username tidak ditemukan.' });
            }

            const book = await trx('public.Book')
                .where({ Book_Name })
                .first();

            if (!book) {
                return res.status(404).json({ message: 'Buku tidak ditemukan' });
            }

            // Tambahkan data ke tabel Display
            const [display] = await trx('public.Review')
                .insert({
                    Review_Number,
                    Timestamp: new Date(),
                    Rating,
                    Text,
                    User_Number: username.User_Number,
                    Book_Number: book.Book_Number
                })
                .returning('*');

            // Tambahkan data ke tabel Staff_Display
            res.json({ message: 'Review Anda berhasil dibuat!' });
        });
    } catch (error) {
        console.error('Error dalam menambahkan review:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

//Membuat akun baru oleh customer
app.post('/api/create_users', async (req, res) => {
    const { User_Number, Username, Password, Email, Customer_Name } = req.body;

    try {
        await db.transaction(async trx => {
            // Cari buku berdasarkan Book_Name
            const customer = await trx('public.Customer')
                .where({ Customer_Name })
                .first();

            if (!customer) {
                return res.status(404).json({ message: 'Customer tidak ditemukan' });
            }

            // Tambahkan data ke tabel Display
            const [user] = await trx('public.Users')
                .insert({
                    User_Number,
                    Username,
                    Password,
                    Email,
                    Customer_Number: customer.Customer_Number
                })
                .returning('*');

            // Tambahkan data ke tabel Staff_Display
            res.json({ message: 'Akun Anda berhasil dibuat!' });
        });
    } catch (error) {
        console.error('Error dalam mebuat akun:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

//Memperbarui data user
app.put('/api/update_users', async (req, res) => {
    const { Username, Password, Email } = req.body;

    try {
        await db.transaction(async trx => {

            const username = await trx('public.Users')
                .where({ Username })
                .first();

            if (!username) {
                return res.status(404).json({ message: 'Username tidak ditemukan.' });
            }

            // Perbarui data di tabel Display
            await trx('public.Users')
                .where({ User_Number: username.User_Number })
                .update({
                    Password,
                    Email,
                });

            res.json({ message: 'Akun berhasil diperbarui.' });
        });
    } catch (error) {
        console.error('Error dalam memperbarui akun:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const PORT = process.env.PORT || 5000; 
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
