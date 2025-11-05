from typing import Dict, Any, Optional, Union, Tuple
import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor
import logging
import os

class PostgresAgent:
    """A minimal, secure interface for PostgreSQL database operations.
    
    This agent provides a streamlined interface for database operations,
    focusing on safe query execution while letting the LLM generate SQL dynamically.
    
    Example Usage:
    ```python
    # Initialize the agent
    db = PostgresAgent({
        'host': 'localhost',
        'database': 'mydb',
        'user': 'user',
        'password': 'pass'
    })
    
    # Basic CRUD Operations
    # -------------------
    
    # Create table
    result = db.execute('''
        CREATE TABLE products (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100),
            price DECIMAL(10,2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Insert data with safe parameter binding
    result = db.execute(
        'INSERT INTO products (name, price) VALUES (%s, %s)',
        ('Widget', 19.99)
    )
    
    # Select data
    result = db.execute(
        'SELECT * FROM products WHERE price < %s',
        (20.00,)
    )
    if result['status'] == 'success':
        products = result['rows']
    
    # Update with parameter binding
    result = db.execute(
        'UPDATE products SET price = price * %s WHERE name = %s',
        (1.1, 'Widget')  # 10% price increase
    )
    
    # Complex Queries
    # --------------
    
    # Aggregation and joins
    result = db.execute('''
        SELECT 
            c.category_name,
            COUNT(p.id) as product_count,
            AVG(p.price) as avg_price
        FROM products p
        JOIN categories c ON p.category_id = c.id
        GROUP BY c.category_name
        HAVING COUNT(p.id) > 5
        ORDER BY avg_price DESC
    ''')
    
    # Transaction Example
    # -----------------
    
    # Execute multiple queries in a transaction
    results = db.execute_transaction([
        # Create order
        ('''
            INSERT INTO orders (user_id, total_amount) 
            VALUES (%s, %s) RETURNING id
        ''', (user_id, total_amount)),
        
        # Create order items
        ('''
            INSERT INTO order_items (order_id, product_id, quantity) 
            VALUES (%s, %s, %s)
        ''', (order_id, product_id, quantity)),
        
        # Update inventory
        ('''
            UPDATE products 
            SET stock_count = stock_count - %s 
            WHERE id = %s
        ''', (quantity, product_id))
    ])
    
    # Schema Modifications
    # ------------------
    
    # Add column
    result = db.execute(
        'ALTER TABLE products ADD COLUMN description TEXT'
    )
    
    # Create index
    result = db.execute(
        'CREATE INDEX idx_products_name ON products(name)'
    )
    
    # Data Analysis
    # ------------
    
    # Complex analytical query
    result = db.execute('''
        WITH monthly_sales AS (
            SELECT 
                DATE_TRUNC('month', created_at) as month,
                SUM(total_amount) as revenue
            FROM orders
            GROUP BY DATE_TRUNC('month', created_at)
        )
        SELECT 
            month,
            revenue,
            LAG(revenue) OVER (ORDER BY month) as prev_month_revenue,
            revenue - LAG(revenue) OVER (ORDER BY month) as revenue_change
        FROM monthly_sales
        ORDER BY month DESC
        LIMIT 12
    ''')
    ```
    """
    
    def __init__(self, connection_params: Dict[str, str]):
        """Initialize the PostgreSQL agent."""
        self.connection_params = connection_params
        self.conn = None
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)

    def connect(self) -> str:
        """Establish database connection."""
        try:
            self.conn = psycopg2.connect(**self.connection_params)
            return "Connected to database"
        except Exception as e:
            return f"Connection error: {str(e)}"

    def close(self) -> str:
        """Close database connection."""
        if self.conn:
            self.conn.close()
            self.conn = None
            return "Connection closed"
        return "No active connection"

    def execute(self, query: str, params: Optional[Tuple] = None, fetch: bool = True) -> Dict[str, Any]:
        """
        Execute a SQL query with proper safety measures.
        
        Args:
            query: SQL query to execute
            params: Query parameters for safe parameter binding
            fetch: Whether to fetch results (for SELECT queries)
        
        Returns:
            Dict with keys:
                status: 'success' or 'error'
                rows: List of result rows (for SELECT queries)
                row_count: Number of rows returned (for SELECT queries)
                affected_rows: Number of rows affected (for UPDATE/DELETE)
                message: Error message if status is 'error'
                
        Example:
            ```python
            # Select with parameters
            result = db.execute(
                'SELECT * FROM users WHERE age > %s AND city = %s',
                (21, 'New York')
            )
            if result['status'] == 'success':
                users = result['rows']
                
            # Insert with parameters
            result = db.execute(
                'INSERT INTO users (name, age) VALUES (%s, %s)',
                ('John', 25)
            )
            if result['status'] == 'success':
                affected = result['affected_rows']
            ```
        """
        if not self.conn:
            self.connect()
            
        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                
                # For SELECT queries
                if fetch and query.strip().lower().startswith('select'):
                    results = cur.fetchall()
                    self.logger.info(f"Query returned {len(results)} rows")
                    return {
                        'status': 'success',
                        'rows': results,
                        'row_count': len(results)
                    }
                
                # For INSERT/UPDATE/DELETE/CREATE/etc
                self.conn.commit()
                return {
                    'status': 'success',
                    'message': f"Query executed successfully",
                    'affected_rows': cur.rowcount
                }
                
        except Exception as e:
            self.conn.rollback()
            error_msg = f"Query error: {str(e)}"
            self.logger.error(error_msg)
            return {
                'status': 'error',
                'message': error_msg
            }

    def execute_transaction(self, queries: list[Tuple[str, Optional[Tuple]]]) -> Dict[str, Any]:
        """
        Execute multiple queries in a transaction.
        
        Args:
            queries: List of (query, params) tuples to execute
        
        Returns:
            Dict with keys:
                status: 'success' or 'error'
                message: Transaction status or error message
                results: List of results from each query
                
        Example:
            ```python
            # Transfer money between accounts
            results = db.execute_transaction([
                (
                    'UPDATE accounts SET balance = balance - %s WHERE id = %s',
                    (100.00, sender_id)
                ),
                (
                    'UPDATE accounts SET balance = balance + %s WHERE id = %s',
                    (100.00, receiver_id)
                ),
                (
                    'INSERT INTO transactions (from_id, to_id, amount) VALUES (%s, %s, %s)',
                    (sender_id, receiver_id, 100.00)
                )
            ])
            ```
        """
        if not self.conn:
            self.connect()
            
        results = []
        try:
            with self.conn:  # Automatic transaction management
                with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                    for query, params in queries:
                        cur.execute(query, params)
                        if query.strip().lower().startswith('select'):
                            results.append({
                                'query': query,
                                'results': cur.fetchall()
                            })
                        else:
                            results.append({
                                'query': query,
                                'affected_rows': cur.rowcount
                            })
                            
            return {
                'status': 'success',
                'message': 'Transaction completed successfully',
                'results': results
            }
            
        except Exception as e:
            error_msg = f"Transaction error: {str(e)}"
            self.logger.error(error_msg)
            return {
                'status': 'error',
                'message': error_msg
            }

def initialize_db() -> PostgresAgent:
    """Initialize the PostgresAgent using environment variables."""
    db_params = {
        'database': os.getenv('DB_NAME'),
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASSWORD'),
        'host': os.getenv('DB_HOST'),
        'port': os.getenv('DB_PORT')
    }
    return PostgresAgent(db_params)


def initialize_test_db() -> PostgresAgent:
    """Initialize the PostgresAgent using environment variables."""
    db_params = {
        'database': os.getenv('TEST_DB_NAME'),
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASSWORD'),
        'host': os.getenv('DB_HOST'),
        'port': os.getenv('DB_PORT')
    }
    return PostgresAgent(db_params)